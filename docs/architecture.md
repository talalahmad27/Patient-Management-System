# Architecture — Patient Record System

## System Overview

A three-tier web application: React frontend, Node.js/Express API, PostgreSQL
database. Multi-tenant — each medical practice is a fully isolated data silo.

```
┌─────────────────────────────────────────────────────┐
│                  Doctor (browser)                   │
│              Next.js / React frontend               │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS / REST + JWT
┌───────────────────────▼─────────────────────────────┐
│              Node.js / Express API                  │
│   ┌─────────────┐          ┌──────────────────────┐ │
│   │  JWT verify  │          │  OpenFGA authz check │ │
│   │  (Auth0)     │─────────▶│  (can_read/write)    │ │
│   └─────────────┘          └──────────────────────┘ │
│   ┌──────────────────────────────────────────────┐  │
│   │              Repository layer               │  │
│   │  patientRepository  │  noteRepository       │  │
│   └──────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │ pg pool
┌───────────────────────▼─────────────────────────────┐
│              PostgreSQL 16                          │
│   dim_practice → dim_staff                          │
│   dim_practice → dim_patient (SCD2)                 │
│               dim_patient → patient_notes           │
└─────────────────────────────────────────────────────┘
```

---

## Authentication — Auth0

Auth0 handles identity. It is responsible for:
- Doctor login (email + password)
- Issuing signed JWT tokens on successful login
- Password reset, MFA (future)

### Login flow

1. Doctor opens the app, clicks Login
2. Redirected to Auth0 hosted login page
3. Auth0 verifies credentials, issues a JWT
4. JWT is stored client-side (Auth0 SDK manages this)
5. Every API request includes the JWT in the Authorization header
6. Backend verifies the JWT signature using Auth0's JWKS public key endpoint
7. The `sub` claim from the JWT maps to `dim_staff.auth_user_id`

### JWT payload (relevant claims)

```json
{
  "sub": "auth0|abc123",        // maps to dim_staff.auth_user_id
  "email": "alice@clinic.com",
  "iat": 1700000000,
  "exp": 1700086400
}
```

---

## Authorisation — Two Layers

Auth0 says who you are. Two independent gates then decide what you can do:

```
Request comes in
       ↓
FGA: Can this user see this patient/note?  →  No  →  403
       ↓ Yes
DB Role: Can this role perform this action?  →  No  →  403
       ↓ Yes
Allow
```

Both gates must pass. Full rationale, the role → action access matrix, and
planned evolution (owner/viewer RLS, `checkRole` middleware, staff creation
flow) are in `docs/architecture-decisions.md`.

### Layer 1 — OpenFGA (resource-level)

OpenFGA handles fine-grained access control. It answers the question:
"Is this doctor allowed to perform this action on this resource?"

### Authorization model

Three types are defined:

```
type staff
  # no relations — staff is a subject only

type practice
  relations
    define member: [staff]       # staff are members of a practice

type patient
  relations
    define practice: [practice]  # patient belongs to a practice
    define can_read:  member from practice
    define can_write: member from practice
```

`can_read` and `can_write` on a patient resolve via `tupleToUserset`:
- Get the `practice` related to the patient
- Check if the requesting user (`staff`) has `member` relation to that practice

### Relationship tuples

Two tuples are written per practice/patient:

| Tuple | Written when |
|-------|-------------|
| `staff:<staffId> member practice:<practiceId>` | Staff onboarded to a practice |
| `practice:<practiceId> practice patient:<patientId>` | Patient created via POST /patients |

**Persistence:** OpenFGA runs with `OPENFGA_DATASTORE_ENGINE: postgres`,
backed by the same Postgres container (an `openfga-migrate` service runs the
schema migration before `openfga` starts — see `docker-compose.yml`). Store,
model, and tuples now survive `docker compose down` / `up`. They are only
wiped by `docker compose down -v`. See the local dev section below for the
one-time bootstrap after a fresh volume.

**Admin bypass:** `checkFGA` calls `next()` immediately, without hitting
OpenFGA at all, when `req.user.role === 'admin'`. Admin bypass is a DB-role
decision (layer 2), not an FGA relation.

### Check at runtime

```
Can staff:dr_alice can_read patient:pt_jane?
→ Who is the practice of patient:pt_jane?  → practice:clinic_a
→ Is staff:dr_alice a member of practice:clinic_a? → YES
→ ALLOWED
```

Dr. Bob from a different practice hits the same check → DENIED.

### Middleware

Every patient/note route runs two middleware functions in sequence:

```
verifyJWT → attachStaff → checkFGA('can_read')  → route handler
verifyJWT → attachStaff → checkFGA('can_write') → route handler
```

### Layer 2 — DB role (`dim_staff.role`)

> "What can this role DO with resources they already have access to?"

`role` column on `dim_staff` (migration `003_staff_roles.sql`): `admin`,
`doctor`, `nurse`, or `receptionist`. Attached to every request as
`req.user.role` by `attachStaff`.

Currently enforced by:
- `requireAdmin` — guards `/api/admin/*` routes, 403s any non-admin role
- `checkFGA` — skips the OpenFGA call for `role === 'admin'`
- `checkRole(...allowedRoles)` — generic role gate. `checkRole('admin',
  'doctor', 'nurse')` guards notes (GET/POST), visit history, and patient
  deletion — blocks `receptionist` specifically. Runs before `checkFGA` in
  the middleware chain (cheap in-memory check fails fast before the OpenFGA
  network call).

Nurse-specific action gating (e.g. hiding delete) is still open — see
`docs/architecture-decisions.md`.

---

## Data Layer

### Repository pattern

All SQL lives in repository files. Route handlers call repositories.
No raw SQL in routes.

```
routes/patients.js
    └── calls patientRepository.findById(id)
              └── executes SQL against db pool
```

### Connection pooling

One shared pg Pool for the entire backend process. Max 20 connections.
Never open a new connection per request.

### Transactions

Any write touching multiple tables uses a transaction. Example — new visit note:

1. Close current patient version (UPDATE dim_patient)
2. Insert new patient version (INSERT dim_patient)
3. Insert note (INSERT patient_notes)

All three in one BEGIN / COMMIT block. If any step fails, ROLLBACK.

### Soft deletes

| Table          | Mechanism          | Notes |
|----------------|--------------------|-------|
| `dim_patient`  | `is_active = false` | Set on all version rows for the patient; applied via `deactivate()` |
| `patient_notes`| `is_deleted = true` | Per-note soft delete |

Nothing is ever hard deleted.

---

## Local Development

### What runs where

| Service    | How it runs locally |
|------------|---------------------|
| PostgreSQL | Docker container via docker-compose |
| OpenFGA    | Docker container via docker-compose (Postgres-backed storage, migrated by the `openfga-migrate` service) |
| Backend    | `npm run dev` (nodemon — auto restart on file change) |
| Frontend   | `npm run dev` (Next.js Turbopack hot reload) |
| Auth0      | Same cloud tenant as production |

### OpenFGA one-time bootstrap

OpenFGA's store, model, and tuples are Postgres-backed and persist across
`docker compose down` / `up` — this only needs to be run once against a
fresh volume (e.g. first setup, or after `docker compose down -v`):

**1. Create a new store**
```bash
curl -X POST http://localhost:8080/stores \
  -H "Content-Type: application/json" \
  -d '{"name": "patient-records"}'
# → note the returned id
```

**2. Write the authorization model**
```bash
curl -X POST http://localhost:8080/stores/<storeId>/authorization-models \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": "1.1",
    "type_definitions": [
      { "type": "staff", "relations": {}, "metadata": { "relations": {} } },
      {
        "type": "practice",
        "relations": { "member": { "this": {} } },
        "metadata": { "relations": { "member": { "directly_related_user_types": [{ "type": "staff" }] } } }
      },
      {
        "type": "patient",
        "relations": {
          "practice": { "this": {} },
          "can_read":  { "tupleToUserset": { "tupleset": { "relation": "practice" }, "computedUserset": { "relation": "member" } } },
          "can_write": { "tupleToUserset": { "tupleset": { "relation": "practice" }, "computedUserset": { "relation": "member" } } }
        },
        "metadata": {
          "relations": {
            "practice": { "directly_related_user_types": [{ "type": "practice" }] },
            "can_read":  { "directly_related_user_types": [] },
            "can_write": { "directly_related_user_types": [] }
          }
        }
      }
    ]
  }'
# → note the returned authorization_model_id
```

**3. Write seed tuples**
```bash
curl -X POST http://localhost:8080/stores/<storeId>/write \
  -H "Content-Type: application/json" \
  -d '{
    "writes": {
      "tuple_keys": [
        { "user": "staff:22222222-2222-2222-2222-222222222222",   "relation": "member",   "object": "practice:11111111-1111-1111-1111-111111111111" },
        { "user": "practice:11111111-1111-1111-1111-111111111111", "relation": "practice", "object": "patient:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }
      ]
    },
    "authorization_model_id": "<modelId>"
  }'
```

**4. Update `.env`**
```
FGA_STORE_ID=<new storeId>
FGA_MODEL_ID=<new modelId>
```

New patients created via POST /patients automatically get their OpenFGA tuple
written by the backend — no manual seeding needed for new patients. Because
the store is now Postgres-backed, these steps do not need to be repeated on
every `docker compose up` — only once per volume.

### Folder structure

```
patient-records/
├── docker-compose.yml
├── .env                            # local credentials — never committed
├── .env.example                    # template — committed
├── docs/
│   ├── design.md
│   ├── schema.md
│   ├── api.md
│   ├── architecture.md
│   └── architecture-decisions.md
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_patient_soft_delete.sql
│   ├── 003_staff_roles.sql
│   ├── 004_patient_access_log.sql
│   └── 005_dummy_receptionist.sql
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── db.js
│       ├── middleware/
│       │   ├── verifyJWT.js
│       │   ├── checkFGA.js
│       │   ├── attachStaff.js
│       │   ├── requireAdmin.js
│       │   └── checkRole.js
│       ├── routes/
│       │   ├── patients.js
│       │   ├── notes.js
│       │   ├── staff.js
│       │   └── admin.js
│       ├── repositories/
│       │   ├── patientRepository.js
│       │   ├── noteRepository.js
│       │   └── staffRepository.js
│       └── validators/
│           ├── patientValidator.js
│           └── noteValidator.js
└── frontend/
    ├── package.json
    ├── lib/
    │   └── auth0.js
    └── app/
        ├── layout.js
        ├── page.js                         # patient list + Add Patient button
        ├── auth/
        │   └── [auth0]/
        │       └── route.js                # Auth0 v4 catch-all: login/logout/callback
        ├── admin/
        │   ├── page.js                     # admin portal: staff list + role stats
        │   └── StaffList.js                # client component — staff table
        ├── api/
        │   └── patients/
        │       ├── route.js                # proxy: POST /api/patients
        │       └── [patientId]/
        │           ├── route.js            # proxy: DELETE, PATCH /api/patients/:id
        │           └── notes/
        │               └── route.js        # proxy: POST /api/patients/:id/notes
        └── patients/
            ├── new/
            │   ├── page.js                 # new patient page (auth guard)
            │   └── NewPatientForm.js       # client form component
            └── [id]/
                ├── page.js                 # patient detail + role-gated sections
                ├── NoteForm.js             # client component — add visit note
                ├── VisitHistoryItem.js     # client component — collapsible visit row
                ├── EditPatientDetails.js   # client component — edit demographics
                └── DeletePatientButton.js  # client component — soft delete
```

---

## File Reference

### Backend

#### `src/index.js`
The Express application entry point. Loads `.env`, registers `express.json()`,
mounts the three route modules under `/api`, and attaches the global error
handler that converts 401/403/500 errors into consistent JSON responses.
Nothing else lives here — no business logic, no SQL.

#### `src/db.js`
Creates and exports a single shared `pg.Pool` (max 20 connections) pointed at
`DATABASE_URL`. Every repository imports this one pool. The pool is never
recreated — one instance for the lifetime of the process.

---

#### `src/middleware/verifyJWT.js`
Wraps `express-oauth2-jwt-bearer`'s `auth()` helper, configured with the Auth0
domain and API audience from env vars. When added to a route it verifies the
incoming JWT's signature against Auth0's JWKS endpoint and attaches the decoded
payload to `req.auth`. Rejects with 401 if the token is missing, expired, or
from the wrong issuer.

#### `src/middleware/attachStaff.js`
Runs after `verifyJWT`. Reads `req.auth.payload.sub` (the Auth0 user ID),
looks up the matching `dim_staff` row via `staffRepository.findByAuthUserId`,
and attaches it to `req.user`. This is how every downstream handler knows
`req.user.staff_id`, `req.user.practice_id`, etc. Returns 404 if the Auth0
user has no corresponding staff record.

#### `src/middleware/checkFGA.js`
Factory function — call it with a relation string (`'can_read'` or
`'can_write'`) and it returns an Express middleware. That middleware calls
`next()` immediately if `req.user.role === 'admin'` (DB-role bypass),
otherwise calls `OpenFgaClient.check()` to ask: "does
`staff:<req.user.staff_id>` have `<relation>` on
`patient:<req.params.patientId>`?" Returns 403 if not. This is what enforces
practice-level data isolation at the access-control layer.

#### `src/middleware/requireAdmin.js`
Runs after `attachStaff`. Returns 403 unless `req.user.role === 'admin'`.
Guards every route under `/api/admin`. This is the DB-role gate — layer 2 of
the two-layer access model (see `docs/architecture-decisions.md`).

#### `src/middleware/checkRole.js`
Factory function — call it with any number of allowed role strings,
`checkRole('admin', 'doctor', 'nurse')`, and it returns an Express middleware
that 403s unless `req.user.role` is in that list. More general than
`requireAdmin` (which only ever checks for `'admin'`); used to gate notes,
visit history, and patient deletion against the `receptionist` role. Placed
before `checkFGA` in the middleware chain since it's a cheap in-memory check
that should fail fast ahead of the OpenFGA network call.

---

#### `src/routes/patients.js`
Six routes for patient CRUD:
- `GET /` — list all active patients for the staff member's practice (paginated, searchable)
- `GET /:patientId` — current patient version. Also looks up the previous
  `patient_access_log` entry (before logging this view) and returns it as
  `last_accessed_by`, then logs the current view.
- `PATCH /:patientId` — updates demographics (full_name, date_of_birth, sex,
  phone, email) on the current row via `patientRepository.updateDemographics`.
  No SCD2 version, no measurements — open to every role, including
  receptionist, since it's not gated by `checkRole`.
- `POST /` — create patient, then write the OpenFGA `practice → patient` tuple so the new patient is immediately accessible
- `DELETE /:patientId` — soft delete (`is_active = false`) via `patientRepository.deactivate`. Gated by `checkRole('admin', 'doctor', 'nurse')` — receptionist gets 403.
- `GET /:patientId/history` — all SCD2 versions with their notes, used for the timeline view. Also gated by `checkRole('admin', 'doctor', 'nurse')`.

Also owns a local `OpenFgaClient` instance for writing tuples on patient creation.

#### `src/routes/notes.js`
Three routes, all nested under `/api/patients/:patientId/notes` (Express
`mergeParams: true` so `:patientId` is visible), all gated by
`checkRole('admin', 'doctor', 'nurse')` — receptionist can't read or write
clinical notes:
- `GET /` — all non-deleted notes for a patient, newest first
- `GET /:noteId` — single note with patient snapshot at time of writing
- `POST /` — validate with Zod, then call `noteRepository.create` which runs the SCD2 transaction

#### `src/routes/staff.js`
Single route: `GET /me`. Returns the logged-in staff member's record. Used by
the frontend to know who is logged in (name, role, practice). Does not require
`attachStaff` middleware — it resolves the staff itself and returns it.

#### `src/routes/admin.js`
Single route: `GET /staff`, guarded by `verifyJWT`, `attachStaff`,
`requireAdmin`. Returns every active staff member in `req.user.practice_id`
via `staffRepository.findAllByPractice`. Used by the `/admin` frontend page.

---

#### `src/repositories/patientRepository.js`
All SQL for the `dim_patient` table, plus the access log:
- `findAllByPractice` — paginated list filtered by `practice_id`, `is_current = true`, `is_active = true`
- `findById` — current version of a single patient
- `findHistory` — all SCD2 version rows for a patient, with notes aggregated via `json_agg`
- `create` — inserts a new patient row with a generated `patient_id` UUID
- `deactivate` — sets `is_active = false` on all rows for a given `patient_id` + `practice_id`
- `findLastAccess` — most recent `patient_access_log` row for a patient (joined to `dim_staff` for the name), or `null` if never viewed
- `logAccess` — inserts a new `patient_access_log` row for the current viewer
- `updateDemographics` — updates `full_name`/`date_of_birth`/`sex`/`phone`/`email` via `COALESCE` (only provided fields change) on the `is_current = true` row only — no new SCD2 version, no measurements touched

#### `src/repositories/noteRepository.js`
All SQL for the `patient_notes` table, plus the SCD2 logic for `dim_patient`:
- `findAllByPatient` — all notes joined to their patient version and author
- `findById` — single note with full patient snapshot (all measurement fields)
- `create` — runs a three-step transaction: close current patient version, insert new version (carrying measurements forward), insert note referencing the new `patient_dim_id`. This always runs — even if no measurements changed — so every visit produces a new timeline entry.

#### `src/repositories/staffRepository.js`
Two functions: `findByAuthUserId` looks up a `dim_staff` row by the Auth0
`sub` claim, used by both `attachStaff` middleware and `GET /staff/me`.
`findAllByPractice` returns all active staff for a practice, sorted by role
then name, used by `GET /admin/staff`.

---

#### `src/validators/patientValidator.js`
`createPatientSchema` (`POST /patients`) — required: `full_name` (min 2
chars), `birth_year` (int, transformed into `date_of_birth` as Jan 1 of that
year). Optional: `sex` (enum), `phone`, `email`, `height_cm`, `weight_kg`,
`bp_systolic`, `bp_diastolic` with numeric range checks.
`updatePatientSchema` (`PATCH /patients/:id`) — same demographic fields
(`full_name`, `birth_year`, `sex`, `phone`, `email`), all optional, `.refine`
requires at least one. No measurement fields — this schema is demographics
only, deliberately excluding clinical data so it can stay open to every role.

#### `src/validators/noteValidator.js`
Zod schema for `POST /patients/:id/notes` request bodies. Required fields:
`visit_datetime` (ISO datetime), `note_type` (enum of four values), `content`
(non-empty string). Optional: `follow_up_date` (must be in the future),
`measurements` object with the four measurement fields. Exported as
`createNoteSchema`.

---

### Frontend

#### `lib/auth0.js`
Creates and exports the `Auth0Client` singleton used by all server components
and API proxy routes. Configured with audience and scope so the returned access
token is accepted by the backend. Imported as `{ auth0 }` wherever a session
needs to be read server-side.

#### `app/layout.js`
Root Next.js layout. Wraps every page in `<Auth0Provider>` (required by
`@auth0/nextjs-auth0` v4 for the client SDK to work) and renders the top nav:
app name, a conditional "Admin Portal" link (fetches `GET /api/staff/me`
server-side and shows the link only when `role === 'admin'`), and a Logout
link. Sets the page `<title>`.

#### `app/auth/[auth0]/route.js`
Next.js catch-all route handler required by `@auth0/nextjs-auth0` v4. Exports
`auth0.handler` as `GET`, which internally handles `/auth/login`,
`/auth/logout`, and `/auth/callback` based on the matched segment.

---

#### `app/page.js`
The patient list page (route: `/`). Server component — fetches the session,
redirects to login if unauthenticated, then calls `GET /api/patients` with the
access token. Renders a table of patients with links to their detail pages.
Includes the "Add Patient" button in the header linking to `/patients/new`.
Shows "No patients found" when the list is empty.

#### `app/patients/new/page.js`
Server component for the new patient page (route: `/patients/new`). Auth guard
only — verifies session and redirects to login if missing. Renders the page
shell (back link, heading) and mounts `NewPatientForm`.

#### `app/patients/new/NewPatientForm.js`
Client component (`'use client'`). The create patient form. Collects full name
(required), date of birth (required), sex, phone, email, and optional initial
measurements. On submit, calls the Next.js proxy `POST /api/patients`, parses
Zod validation errors from the response if the request fails, and redirects to
the new patient's detail page on success.

#### `app/patients/[id]/page.js`
Server component for the patient detail page (route: `/patients/:id`). Fetches
session, then makes three parallel requests — `GET /api/patients/:id` (current
record), `GET /api/patients/:id/history` (all versions with notes), and
`GET /api/staff/me` (viewer's role). Renders the current measurements in stat
cards, a "Last checked by <name> · <relative time>" line under the patient
name when `last_accessed_by` is present, and always mounts
`EditPatientDetails`. When `role === 'receptionist'`, `NoteForm` and
`DeletePatientButton` are omitted and the Visit History section renders a
"visible to clinical staff only" message instead of the timeline; every other
role sees the full SCD2 history as a vertical timeline of `VisitHistoryItem`s.

#### `app/patients/[id]/NoteForm.js`
Client component (`'use client'`). An expandable "Add Note" form on the patient
detail page. Collapsed by default (shows only a button). When opened, collects
note type, content, optional follow-up date, and optional updated measurements.
Calls the Next.js proxy `POST /api/patients/:id/notes`. Closes and refreshes
the page via `router.refresh()` on success.

#### `app/patients/[id]/VisitHistoryItem.js`
Client component (`'use client'`). One row per SCD2 version in the timeline.
Collapsed by default — shows just the visit date, a note-count badge, and (for
the current version) a "Latest Patient Visit" badge. Click toggles a chevron
and expands to reveal the measurements row and full note content underneath.

#### `app/patients/[id]/EditPatientDetails.js`
Client component (`'use client'`). Expandable "Edit Details" form (full_name,
birth_year, sex, phone, email), pre-filled from the current patient record.
Calls the Next.js proxy `PATCH /api/patients/:id`, then `router.refresh()`.
Mounted for every role — it's the endpoint that gives the `receptionist`
role a way to fix demographic details without clinical write access.

#### `app/patients/[id]/DeletePatientButton.js`
Client component (`'use client'`). Renders a "Delete Patient" button. On first
click, expands inline to show "Delete <name>?" with confirm/cancel buttons —
no modal, no page navigation. On confirm, calls `DELETE /api/patients/:id`
and redirects to the patient list on success. Shows an inline error message
if the request fails. Not rendered at all for `role === 'receptionist'`.

#### `app/admin/page.js`
Server component for the admin portal (route: `/admin`). Fetches the session
and redirects to login if missing. Calls the backend
`GET /api/admin/staff` directly (with the bearer token attached
server-side) — no `app/api` proxy route, since nothing calls it from client
JS. Redirects home if the backend responds non-OK (i.e. `requireAdmin`
rejected a non-admin staff member). Renders role stat cards (counts of
admin/doctor/nurse/receptionist) and mounts `StaffList`.

#### `app/admin/StaffList.js`
Client component (`'use client'`). Renders the staff table: avatar with
initials, name (+ preferred name if set), a color-coded role badge,
specialty, and email.

---

#### `app/api/patients/route.js`
Next.js API route — proxy for `POST /api/patients`. Reads the session
server-side, adds the `Authorization: Bearer <token>` header, and forwards
the request body to the Express backend. Returns the backend's response
(201 on success, 400 with Zod errors on validation failure). This exists
because the browser cannot hold the access token — the proxy adds it safely
on the server.

#### `app/api/patients/[patientId]/route.js`
Next.js API route — proxy for `DELETE /api/patients/:patientId` (returns 204
on success) and `PATCH /api/patients/:patientId` (returns the updated
patient JSON or the backend's error response unchanged). Same pattern for
both: reads session, adds auth header, forwards to backend.

#### `app/api/patients/[patientId]/notes/route.js`
Next.js API route — proxy for `POST /api/patients/:patientId/notes`. Reads
session, forwards the note body with auth header to the backend. Returns the
backend's 201 response or the error response unchanged.

---

## Hosting — Production

### Infrastructure

| Component  | Service               | Notes |
|------------|-----------------------|-------|
| Frontend   | Vercel                | Auto-deploy from GitHub main branch |
| Backend    | AWS ECS (Fargate)     | Containerised Express app |
| Database   | AWS RDS (Postgres 16) | Multi-AZ, automated backups |
| Secrets    | AWS Secrets Manager   | DATABASE_URL, Auth0 credentials |
| Container  | AWS ECR               | Docker image registry |
| CI/CD      | GitHub Actions        | Test → build → push image → deploy |

### Environment variables

```
DATABASE_URL          postgresql://...
AUTH0_DOMAIN          patient-records.au.auth0.com
AUTH0_CLIENT_ID       ...
AUTH0_CLIENT_SECRET   ...
AUTH0_AUDIENCE        https://api.patientrecords.com
FGA_API_URL           http://localhost:8080  (or production URL)
FGA_STORE_ID          from OpenFGA setup
FGA_MODEL_ID          from OpenFGA setup
NODE_ENV              development | production
PORT                  3001
```

---

## Scalability Notes

- **Read replicas** — the repository pattern means adding a read replica
  requires changing one line in db.js, not touching any route code
- **SOAP notes** — add `soap JSONB` column to patient_notes alongside
  `content`. Existing notes untouched. No downtime migration.
- **File attachments** — `s3_object_id` column already exists on both
  `dim_patient` and `patient_notes`. Wire up S3 upload and populate it.
- **Multiple doctors per practice** — OpenFGA model already supports this.
  Add more `member` tuples. No schema changes.
- **Full-text note search** — add a GIN index on `patient_notes.content`.
  Single migration, no application changes.
