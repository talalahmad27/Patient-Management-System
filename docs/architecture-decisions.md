# Architecture Decisions & Brainstorming

## Access Control Architecture

### The Two-Layer Model (Agreed)

```
Request comes in
       ↓
FGA: Can this user see this patient/note?  →  No  →  403
       ↓ Yes
DB Role: Can this role perform this action?  →  No  →  403
       ↓ Yes
Allow
```

Two independent gates. Both must pass.

---

### Layer 1 — OpenFGA (Resource-level access)

> "Can THIS user see THIS specific patient/note?"

Every patient record has an explicit list of who can see it. Not "all doctors in this practice" but "Dr. Clarke and Nurse Sarah can see Patient X."

This is Row Level Security (RLS) at the application layer — the same model used by Google Docs (via Google Zanzibar, which OpenFGA is based on).

**Rules:**
- Patient created → primary doctor becomes `owner`
- Admin assigns nurse to patient → `viewer` tuple written for that nurse
- Patient transferred → old tuple removed, new one written
- Notes inherit access from their patient — if you can read the patient, you can read their notes (no separate FGA tuples needed for notes)
- Admin bypasses FGA entirely (handled at middleware layer via DB role check)

**Target FGA model:**
```
type staff {}

type practice {
  relations:
    member: staff
}

type patient {
  relations:
    owner:           staff          # primary doctor
    viewer:          staff          # explicitly shared (nurse, another doctor)
    practice:        practice       # links patient to practice

  can_read:   owner | viewer | practice#member (admin only via bypass)
  can_write:  owner | viewer
}
```

**Tuples written on patient creation:**
- `owner: staff:doctor_id` → patient
- `practice: practice:practice_id` → patient

**Tuples written on assignment:**
- `viewer: staff:nurse_id` → patient

---

### Layer 2 — DB Role (Action-level permissions)

> "What can this role DO with resources they already have access to?"

Stored as a `role` column on `dim_staff`.

| Action                  | Admin | Doctor | Nurse | Receptionist |
|-------------------------|-------|--------|-------|--------------|
| View patients           | ✅    | ✅     | ✅    | ✅           |
| Add patient             | ✅    | ✅     | ✅    | ✅           |
| View clinical notes     | ✅    | ✅     | ✅    | ❌           |
| Add clinical notes      | ✅    | ✅     | ✅    | ❌           |
| Delete patient          | ✅    | ✅     | ❌    | ❌           |
| View staff profiles     | ✅    | ❌     | ❌    | ❌           |
| Create/manage staff     | ✅    | ❌     | ❌    | ❌           |
| Access admin portal     | ✅    | ❌     | ❌    | ❌           |

Enforced via a `checkRole(action)` middleware that reads `req.user.role` (already available on every request via `attachStaff`).

---

### Why This Architecture

- **HIPAA compliance** — minimum necessary access principle. Staff only see patients they're treating, not every patient in the practice.
- **Audit trail** — OpenFGA's tuple log records who had access to what and when, which satisfies HIPAA audit requirements.
- **Scalability** — adding a new role means adding a row to the access matrix, not rearchitecting the system.
- **Industry standard** — same pattern used by AWS IAM (policies = what you can do, resource permissions = what you can see). Used by healthcare SaaS products like Epic, Athenahealth, Meditech.

---

## What's Built (Current State)

### Database
- `dim_staff.role` column — values: `admin`, `doctor`, `nurse`, `receptionist`
- Seeded: Dr. Test Doctor (admin), Dr. Emily Clarke (dummy doctor for testing)

### Backend
- `checkFGA` middleware — skips FGA entirely if `req.user.role === 'admin'`
- `requireAdmin` middleware — guards `/api/admin/*` routes
- `GET /api/admin/staff` — returns all staff in the practice

### Frontend
- Admin Portal at `/admin` — shows staff list with roles and stats
- Header shows "Admin Portal" link only when logged in as admin

### OpenFGA (Current — practice-level, to be evolved)
- Model: `staff member practice → can_read/write patient`
- All doctors in a practice can see all patients — not yet RLS

---

## What's Planned (In Priority Order)

### 1. Update FGA model to owner/viewer (RLS)
- Change from practice-level blanket access to per-patient tuples
- `owner` relation for primary doctor
- `viewer` relation for assigned nurses/secondary doctors
- Update `POST /api/patients` to write `owner` tuple instead of `practice` tuple

### 2. Patient assignment UI in admin portal
- Admin can assign doctors and nurses to a patient
- Writes/removes FGA viewer tuples
- Shows current care team on patient profile

### 3. `checkRole` middleware
- Gates actions by DB role (delete, notes access)
- Sits between `attachStaff` and the route handler

### 4. Create staff flow
- Admin creates a new staff member
- Calls Auth0 Management API (M2M token) to create login
- Inserts `dim_staff` row
- Writes FGA `member` tuple for the practice
- Auth0 sends invitation email to new staff member

### 5. Role-based UI differences
- Receptionists don't see the notes section on patient profiles
- Nurses don't see the delete button
- Non-admins don't see Admin Portal link

---

## Open Questions

- **Auth0 M2M app** — needs to be set up in Auth0 dashboard before create staff flow can be built
- **Note-level FGA** — do notes ever need independent access control (e.g., psychiatry notes visible only to the treating psychiatrist)? If yes, notes need their own FGA type.
- **Patient transfer** — when a patient moves from one doctor to another, should the old doctor lose access or retain read-only history access?
- **Receptionist note visibility** — completely hidden in UI, or visible as "restricted"?

---

## Session Summary — 2026-06-27

### What was accomplished

1. **Fixed OpenFGA persistence** — switched `docker-compose.yml` from in-memory storage to Postgres-backed OpenFGA. Data now survives Docker restarts. Added `openfga-migrate` service that runs schema migration before OpenFGA starts.

2. **Fixed Node v26 hang** — `@opentelemetry/semantic-conventions` v1.41.1 hangs indefinitely on Node v26. Fixed by adding `"overrides": { "@opentelemetry/semantic-conventions": "1.27.0" }` to `backend/package.json`.

3. **Fixed DATABASE_URL** — Node v26 resolves `localhost` to IPv6 `::1`, causing pg pool to hang. Changed `DATABASE_URL` in `.env` to use `127.0.0.1` explicitly.

4. **Added `role` column to `dim_staff`** — migration `003_staff_roles.sql`. Values: `admin`, `doctor`, `nurse`, `receptionist`. Existing test doctor was promoted to `admin`. A second dummy doctor record was inserted for testing.

5. **Built admin portal**
   - Backend: `requireAdmin` middleware, `GET /api/admin/staff` route
   - Frontend: `/admin` page with stats cards + staff table, "Back to Patients" nav link
   - Header nav: shows "Admin Portal" link only when logged in as admin
   - `checkFGA` middleware: skips FGA entirely when `req.user.role === 'admin'`

6. **Designed two-layer access control architecture** (documented above in this file)

### Key IDs (as of this session)

```
FGA_STORE_ID  = 01KW3NW5E9FRXYMR8FW8QX8J5D
FGA_MODEL_ID  = 01KW3NWBSEE4TF6Y2YER4DTKSJ
```

These are now persistent in Postgres — they survive `docker compose down` and `docker compose up`. They only reset if you run `docker compose down -v` (which wipes the volume).

### Startup sequence (reliable)

```bash
# 1. Kill any leftover backend processes
lsof -ti :3001 | xargs kill -9 2>/dev/null; true

# 2. Start Docker services
docker compose up -d

# 3. Wait ~5s for OpenFGA to be ready, then start backend
cd backend && npm run dev

# 4. Start frontend (separate terminal)
cd frontend && npm run dev
```

If the frontend hangs (infinite loading, no page render):
```bash
rm -rf frontend/.next
# then restart: cd frontend && npm run dev
```

### Known gotchas

| Problem | Root cause | Fix |
|---------|------------|-----|
| Backend port 3001 already in use | Old nodemon process still running | `lsof -ti :3001 \| xargs kill -9` |
| Frontend hangs indefinitely | `.next` cache corruption | `rm -rf frontend/.next` |
| Node v26 backend hangs on startup | `@opentelemetry/semantic-conventions` v1.41.1 | npm override to `1.27.0` in `backend/package.json` |
| `localhost` db connection hangs | Node v26 prefers IPv6 `::1`, pg listens on `127.0.0.1` | Use `127.0.0.1` in `DATABASE_URL` |
| FGA tuples lost on restart | Was using in-memory OpenFGA | Now Postgres-backed — solved permanently |
| "Patient not found" after restart | Old backend running with stale FGA IDs | Force-kill old backend, restart fresh |

### Test accounts (in DB)

| staff_id | Name | Role | Auth0 login |
|----------|------|------|-------------|
| `22222222-2222-2222-2222-222222222222` | Dr. Test Doctor | admin | Real Auth0 account |
| `33333333-3333-3333-3333-333333333333` | Dr. Emily Clarke | doctor | `auth0\|dummy-doctor-001` (no real login) |

### Next session — pick up here

1. **Update FGA model to owner/viewer** — per-patient RLS instead of blanket practice access
2. **`checkRole` middleware** — gate delete and notes by DB role
3. **Patient assignment UI** — admin assigns doctors/nurses to a patient (writes FGA viewer tuples)
4. **Create staff flow** — Auth0 Management API + DB insert + FGA tuple (needs Auth0 M2M app set up first)
