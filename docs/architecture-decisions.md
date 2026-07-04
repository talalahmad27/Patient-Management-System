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

### OpenFGA (Current — practice-level, decided to stay this way)
- Model: `staff member practice → can_read/write patient`
- All staff in a practice can see all patients — practice-wide access,
  **by design** (see "Decision — practice-wide access, not per-patient RLS"
  below), not a gap to be closed

### Access log
- `patient_access_log` table — one row per chart view (`patient_id`,
  `staff_id`, `practice_id`, `accessed_at`)
- `GET /api/patients/:id` reads the previous entry (→ `last_accessed_by` in
  the response) before writing the new one, so a viewer sees who checked the
  chart before them, not themselves
- Frontend patient detail page shows "Last checked by <name> · <relative
  time>" under the patient name

---

## Decision — Practice-Wide Access, Not Per-Patient RLS (2026-07-04)

The owner/viewer RLS model originally planned as roadmap item #1 (below,
struck through) has been **dropped** in favor of matching how production
EHRs actually behave:

- **PCP/ownership is a workflow label, not a security boundary**, in
  Epic/Cerner/Athenahealth. Any credentialed staff member in the org can open
  any chart — because a patient can show up covered by a different doctor,
  in an emergency, or referred, and hard-blocking access is itself a patient
  safety risk.
- **"Minimum necessary" is enforced via audit, not via blocking reads.** The
  dominant real-world pattern is broad access + heavy audit logging (+
  "break-the-glass" workflows for genuinely restricted charts), not a
  Zanzibar-style ACL per patient.
- Strict per-patient ACLs are more common in boutique/specialty software
  (e.g. mental health platforms) where the provider pool per patient is
  small by design — not the shape of this app (small clinic, one practice
  per tenant, most staff need to see most patients).

**What this means concretely:**
- `checkFGA` stays exactly as it is — practice-level `member` → `can_read` /
  `can_write`. No `owner`/`viewer` relations, no per-patient tuples.
- `patient_access_log` (see "What's Built" above) is the actual compliance
  mechanism — it answers "who accessed this chart and when," which is what
  "minimum necessary" audit trail requirements are actually asking for.
- Transfer-of-care and note-level restriction (see "Open Questions") are
  revisited only if a genuinely sensitive note category (e.g. psychotherapy
  notes) is added — not for patients/notes in general.

~~### 1. Update FGA model to owner/viewer (RLS)~~ — **dropped**, see decision above

---

## What's Planned (In Priority Order)

### ~~1. `checkRole` middleware~~ — done 2026-07-04
- `backend/src/middleware/checkRole.js` — factory, `checkRole(...allowedRoles)`,
  403s if `req.user.role` isn't in the list
- Applied to `GET/POST /patients/:id/notes`, `GET /patients/:id/notes/:noteId`,
  `GET /patients/:id/history`, and `DELETE /patients/:id`, all as
  `checkRole('admin', 'doctor', 'nurse')` — blocks receptionist only, since
  nurse's own restrictions (matrix row "Delete patient": ❌ for nurse) haven't
  been brainstormed/finalized yet and shouldn't be silently enforced as a
  side effect of building the receptionist role
- Runs before `checkFGA` in the middleware chain (cheap in-memory check fails
  fast before the OpenFGA network call)

### 2. Create staff flow
- Admin creates a new staff member
- Calls Auth0 Management API (M2M token) to create login
- Inserts `dim_staff` row
- Writes FGA `member` tuple for the practice
- Auth0 sends invitation email to new staff member

### 3. Role-based UI differences
- ~~Receptionists don't see the notes section on patient profiles~~ — done
  2026-07-04 (see roadmap item 6)
- Nurses don't see the delete button — still open, depends on a Nurse-role
  brainstorm/finalization first
- Non-admins don't see Admin Portal link (already done)

### 4. Doctor-role improvements (brainstormed 2026-07-04, not yet built)
- Follow-up worklist — surface `patient_notes.follow_up_date` as an
  upcoming-follow-ups view; no schema change needed
- SOAP-structured notes — add fields alongside `patient_notes.content`
  (Subjective/Objective/Assessment/Plan), a `design.md` future consideration
- Delete-permission tightening — reconsider whether any doctor in the
  practice should be able to soft-delete any patient, or whether this should
  narrow once/if a designated-provider concept exists (soft label only, per
  the decision above — not an FGA change)

### 5. AI-assisted patient history summary (brainstormed 2026-07-04, not yet built)
- Summarize a patient's full visit history (`findHistory` already returns the
  right shape — all SCD2 versions + notes via `json_agg`) into a clinician-
  facing summary
- **Local Ollama, not a cloud API** — keeps PHI inside our own
  infrastructure, avoids needing a BAA with a third-party LLM provider. Fits
  the existing docker-compose pattern (Postgres, OpenFGA already run
  locally).
- **Generated once per note update, not per page view** — triggered from
  `POST /patients/:id/notes`, cached (e.g. a `summary` column or small table
  keyed by `patient_id`), not regenerated on every chart open
- **Always shown with an "AI Assisted Summary" tag** — signals to the
  clinician it's generated, not authored; raw visit history remains the
  source of truth underneath it
- Open question: needs a real quality check — try a candidate Ollama model
  against actual patient note histories before committing. Also a production
  hosting question: current deploy target is AWS ECS Fargate (no GPU), so
  production hosting for the model may need to be decided separately from
  local dev (see `docs/architecture.md` → Hosting)

### 6. Receptionist-role improvements (brainstormed + finalized 2026-07-04)

**Built 2026-07-04:**
- **Access matrix enforced** — `checkRole('admin', 'doctor', 'nurse')` blocks
  receptionist from `GET/POST` notes, `GET /history`, and `DELETE /patients/:id`.
- **New demographics endpoint** — `PATCH /api/patients/:patientId`
  (`patientRepository.updateDemographics`), gated by `checkFGA('can_write')`
  only, no role restriction (any staff member can fix a patient's name/DOB/
  sex/phone/email). Updates the current `dim_patient` row directly — no SCD2
  version, no measurements, no notes touched. Frontend: `EditPatientDetails.js`,
  an expandable form on the patient detail page, available to every role.
- **Frontend gating** — patient detail page fetches the viewer's role
  (`GET /staff/me`) and hides `NoteForm`, `DeletePatientButton`, and the
  Visit History content for receptionists, replacing the history section
  with "Clinical visit history is visible to clinical staff only."
- **Simplified from the original plan**: shipped as a flat restriction
  message rather than the "N clinical notes on file" count-with-placeholder
  idea — showing a count would require the history endpoint to be reachable
  (for the count) while still hiding content, which is more backend
  complexity than the ask needed today. Can be revisited later.
- **Vitals stay visible to receptionist** — a scope call made during
  implementation: the matrix's "View patients ✅" row includes the
  measurements embedded in `GET /patients/:id` (weight/height/BP aren't a
  separate matrix row), so only notes/history/delete were hard-gated. Worth
  confirming this reads correctly — if vitals should also be receptionist-
  hidden, that's a follow-up.
- **Schema fix required first**: `dim_staff.staff_type` had a leftover CHECK
  constraint from before the `role` column existed (`'doctor'`/`'admin'`
  only), which blocked inserting nurse/receptionist rows entirely. Widened in
  `005_dummy_receptionist.sql` to match `role`'s four values, plus a dummy
  receptionist test account (`44444444-...`, `auth0|dummy-receptionist-001`).

**Still open:**
- **Billing/Medicare assistance** — naturally receptionist-facing once the
  Medicare billing integration (`design.md` future consideration) exists;
  `dim_staff.provider_number` is already stored, ready for that later.
- **Appointment scheduling & check-in — new epic, in scope** (decided
  2026-07-04). Biggest single gap for this role: there's no appointment
  concept anywhere in the schema today, and real front-desk work is
  dominated by booking/rescheduling/check-in. This is a bigger scope than
  the rest of this list — needs its own design pass (new `dim_appointment`
  table, booking/reschedule/check-in UI, receptionist-facing calendar view)
  rather than being fully specified here.

---

## Open Questions

- **Auth0 M2M app** — needs to be set up in Auth0 dashboard before create staff flow can be built
- **Note-level FGA** — do notes ever need independent access control (e.g., psychiatry notes visible only to the treating psychiatrist)? If yes, notes need their own FGA type.
- **Patient transfer** — when a patient moves from one doctor to another, should the old doctor lose access or retain read-only history access?
- ~~**Receptionist note visibility**~~ — resolved 2026-07-04: visible as "restricted" (note count shown, content hidden). See roadmap item 6.

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
| Backend not picking up code changes | It was running as plain `node src/index.js`, not `nodemon` — no file watching | Kill it, restart with `cd backend && npm run dev` (or re-run `node src/index.js` after every change if nodemon misbehaves) |
| Can't insert a nurse/receptionist `dim_staff` row | `staff_type` CHECK constraint predated the `role` column, only allowed `'doctor'`/`'admin'` | Widened in `005_dummy_receptionist.sql` to match `role`'s four values |

### Test accounts (in DB)

| staff_id | Name | Role | Auth0 login |
|----------|------|------|-------------|
| `22222222-2222-2222-2222-222222222222` | Dr. Test Doctor | admin | Real Auth0 account |
| `33333333-3333-3333-3333-333333333333` | Dr. Emily Clarke | doctor | `auth0\|dummy-doctor-001` (no real login) |
| `44444444-4444-4444-4444-444444444444` | Nadia Kelly | receptionist | `auth0\|dummy-receptionist-001` (no real login) |

### Next session — pick up here (superseded 2026-07-04, see below)

1. ~~Update FGA model to owner/viewer~~ — dropped, see "Decision — Practice-Wide Access" section
2. **`checkRole` middleware** — gate delete and notes by DB role
3. **Patient assignment UI** — admin assigns doctors/nurses to a patient (writes FGA viewer tuples)
4. **Create staff flow** — Auth0 Management API + DB insert + FGA tuple (needs Auth0 M2M app set up first)

---

## Session Summary — 2026-07-04

### What was accomplished

1. **Decided against owner/viewer RLS** — researched how production EHRs
   (Epic, Cerner, Athenahealth) actually handle patient ownership: it's a
   workflow label (PCP/care team), not a hard access boundary. Practice-wide
   access stays; "minimum necessary" is satisfied via an audit log instead of
   blocking reads. Full rationale in the Decision section above.

2. **Built `patient_access_log`** — migration `004_patient_access_log.sql`.
   `GET /api/patients/:id` now reads the previous access entry
   (`last_accessed_by`) before writing a new one, so a viewer sees who
   checked the chart before them. Verified directly against the DB: fresh
   patient → `null`, then each subsequent viewer correctly sees the prior
   viewer, never themselves.

3. **Frontend**: patient detail page shows "Last checked by <name> · <relative
   time>" under the patient name.

4. **Brainstormed doctor-role improvements** (not yet built) — see roadmap
   item 4 above: follow-up worklist, SOAP-structured notes, delete-permission
   tightening. Nurse/admin brainstorms still to do.

5. **Brainstormed, finalized, and built the receptionist role** — see
   roadmap item 6. `checkRole` middleware (item 1) built as a prerequisite.
   New `PATCH /patients/:id` demographics endpoint + `EditPatientDetails.js`
   frontend. Notes/history/delete now blocked for receptionist at the API
   level (`checkRole('admin','doctor','nurse')`), not just hidden in the UI.
   Also fixed a pre-existing schema gap (`staff_type` CHECK constraint didn't
   allow nurse/receptionist) that blocked testing this at all —
   `005_dummy_receptionist.sql`. Verified `checkRole` and
   `updateDemographics` directly (isolated middleware calls + a real DB
   round-trip); full browser click-through still needs a real receptionist
   Auth0 login, which isn't available in this environment.

6. Decided appointment scheduling & check-in is in scope as a future epic
   (not yet designed).

### Next session — pick up here

1. Brainstorm Nurse role improvements, then Admin
2. **Patient assignment UI** — admin assigns doctors/nurses to a patient (now just a UI/workflow feature, no FGA tuple writes needed since access stays practice-wide)
3. **Create staff flow** — Auth0 Management API + DB insert + FGA tuple (needs Auth0 M2M app set up first)
4. **Appointment scheduling & check-in** — new epic, needs its own design pass (schema, booking/reschedule/check-in UI, receptionist-facing calendar view)
5. Manually verify the receptionist role in the browser (log in as `auth0|dummy-receptionist-001` or equivalent, confirm notes/history/delete are hidden and demographics editing works)
