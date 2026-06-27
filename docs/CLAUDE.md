# CLAUDE.md — Patient Record System

This file is read by Claude Code at the start of every session.
It is the single source of truth for how this project is built.

---

## What This Project Is

A multi-tenant web application for doctors to manage patient records.
Each practice is fully isolated — a doctor can only access patients
belonging to their own practice.

---

## Stack

| Layer      | Choice                          |
|------------|---------------------------------|
| Frontend   | Next.js 16 (React, Turbopack)   |
| Backend    | Node.js + Express               |
| Database   | PostgreSQL 16 in Docker         |
| Auth       | Auth0 (identity) + OpenFGA (authorisation) |
| Validation | Zod (request bodies)            |
| DB client  | pg (raw SQL, no ORM)            |

---

## Database — Four Tables

```
dim_practice
    ├── dim_staff          (practice_id → dim_practice)
    └── dim_patient        (practice_id → dim_practice)  ← SCD Type 2
              └── patient_notes  (patient_dim_id → dim_patient)
```

### dim_patient is SCD Type 2

Never UPDATE a patient row to change measurements. On every visit note:
1. `UPDATE dim_patient SET effective_to = now(), is_current = false WHERE patient_id = $1 AND is_current = true`
2. `INSERT` new row carrying the latest measurements

This happens **on every note**, not only when measurements change.

Two key IDs:
- `patient_id` — stable, never changes, identifies the person
- `patient_dim_id` — changes each version, identifies the snapshot

### Soft deletes

- `dim_patient.is_active = false` — hides patient from all queries (set on all version rows)
- `patient_notes.is_deleted = true` — hides a note from all queries

Nothing is ever hard deleted.

### patient_notes carries both IDs

- `patient_dim_id` — pins the note to the exact measurement snapshot
- `patient_id` — denormalised for simple "all notes for patient" queries

Full schema (including migration history): see `docs/schema.md`  
Full API: see `docs/api.md`  
Full architecture: see `docs/architecture.md`  
Design decisions: see `docs/design.md`

---

## OpenFGA Authorization Model

Three types:

```
staff   — no relations (subject only)

practice
  member: [staff]          # staff:X member practice:Y → X works at Y

patient
  practice: [practice]     # practice:X practice patient:Y → X owns Y
  can_read:  member from practice
  can_write: member from practice
```

### Tuples written at runtime

| Tuple | When written |
|-------|-------------|
| `staff:<id> member practice:<id>` | Staff onboarded (currently seeded manually) |
| `practice:<id> practice patient:<id>` | Automatically on POST /patients |

### OpenFGA is in-memory locally

On every `docker compose up`, the store, model, and all tuples are wiped.
Must re-create the store, re-write the model, re-seed the two seed tuples,
and update `FGA_STORE_ID` + `FGA_MODEL_ID` in `.env`.
See `docs/architecture.md` for the full re-seed curl commands.

---

## Non-Negotiable Rules

- **No ORM** — do not install or use Prisma, Sequelize, TypeORM, or similar
- **No raw SQL in routes** — all queries go in repository files
- **No hard deletes** — use `is_deleted = true` (notes) or `is_active = false` (patients)
- **Multi-table writes use transactions** — always BEGIN / COMMIT / ROLLBACK
- **SCD2 on every note** — always close current patient version and insert new one, even if no measurements changed
- **Validate all request bodies with Zod** before touching the database
- **Every route requires JWT** — `verifyJWT` middleware on all routes except `/health`
- **Patient/note routes require OpenFGA check** — `checkFGA('can_read')` or `checkFGA('can_write')`
- **POST /patients must write FGA tuple** — after inserting, write `practice:<id> practice patient:<id>` via fgaClient

---

## Backend Route Summary

| Method | Path | Middleware | Repository |
|--------|------|------------|------------|
| GET | /api/staff/me | verifyJWT, attachStaff | staffRepository.findByAuthId |
| GET | /api/patients | verifyJWT, attachStaff | patientRepository.findAllByPractice |
| POST | /api/patients | verifyJWT, attachStaff | patientRepository.create + fgaClient.write |
| GET | /api/patients/:id | verifyJWT, attachStaff, checkFGA(can_read) | patientRepository.findById |
| DELETE | /api/patients/:id | verifyJWT, attachStaff, checkFGA(can_write) | patientRepository.deactivate |
| GET | /api/patients/:id/history | verifyJWT, attachStaff, checkFGA(can_read) | patientRepository.findHistory |
| GET | /api/patients/:id/notes | verifyJWT, attachStaff, checkFGA(can_read) | noteRepository.findAllByPatient |
| POST | /api/patients/:id/notes | verifyJWT, attachStaff, checkFGA(can_write) | noteRepository.create (transaction) |
| GET | /api/patients/:id/notes/:noteId | verifyJWT, attachStaff, checkFGA(can_read) | noteRepository.findById |

---

## Frontend Page & Proxy Summary

| Path | Type | Purpose |
|------|------|---------|
| `/` | Server page | Patient list with Add Patient button |
| `/patients/new` | Server page + client form | Create new patient |
| `/patients/[id]` | Server page | Patient detail, measurements, history timeline, delete button |
| `/api/patients` | API route (proxy) | POST → backend POST /api/patients |
| `/api/patients/[patientId]` | API route (proxy) | DELETE → backend DELETE /api/patients/:id |
| `/api/patients/[patientId]/notes` | API route (proxy) | POST → backend POST /api/patients/:id/notes |

---

## Folder Structure

```
backend/src/
  index.js
    Loads .env, registers express.json(), mounts the three route modules,
    and wires up the global error handler (401/403/500 → JSON).

  db.js
    Creates and exports one shared pg.Pool (max 20 connections). Every
    repository imports this — never create a connection per request.

  middleware/
    verifyJWT.js
      Wraps express-oauth2-jwt-bearer. Verifies the JWT signature against
      Auth0's JWKS endpoint; attaches decoded payload to req.auth. Rejects
      with 401 if missing, expired, or wrong issuer.

    attachStaff.js
      Reads req.auth.payload.sub (Auth0 user ID), looks up the matching
      dim_staff row, attaches it to req.user. Gives every downstream handler
      req.user.staff_id and req.user.practice_id. Returns 404 if no staff row.

    checkFGA.js
      Factory: checkFGA('can_read') returns middleware that asks OpenFGA
      "does this staff have <relation> on this patient?" Returns 403 if not.
      Enforces practice-level isolation at the access-control layer.

  routes/
    patients.js
      GET / list, GET /:id current record, POST / create (+ writes FGA tuple),
      DELETE /:id soft delete, GET /:id/history SCD2 timeline.

    notes.js
      GET / all notes for a patient, GET /:noteId single note with snapshot,
      POST / new note (triggers SCD2 transaction in noteRepository).
      Uses mergeParams:true so :patientId is inherited from the parent mount.

    staff.js
      GET /me — returns the logged-in staff member's record from dim_staff.

  repositories/
    patientRepository.js
      findAllByPractice (paginated, filters is_current + is_active),
      findById (current version), findHistory (all SCD2 rows + notes via
      json_agg), create (new patient row), deactivate (is_active = false).

    noteRepository.js
      findAllByPatient, findById (with patient snapshot), create — runs the
      three-step SCD2 transaction: close current version → insert new version
      → insert note. Always runs on every note, even if no measurements changed.

    staffRepository.js
      findByAuthUserId — looks up dim_staff by Auth0 sub claim. Used by both
      attachStaff middleware and GET /staff/me.

  validators/
    patientValidator.js
      Zod schema for POST /patients. Required: full_name (min 2), date_of_birth
      (valid past date). Optional: sex enum, phone, email, measurements with
      numeric range checks.

    noteValidator.js
      Zod schema for POST /patients/:id/notes. Required: visit_datetime (ISO),
      note_type (enum), content (non-empty). Optional: follow_up_date (future),
      measurements object.

frontend/
  lib/auth0.js
    Auth0Client singleton configured with audience + scope. Imported as
    { auth0 } by all server components and API proxy routes to read sessions.

  app/layout.js
    Root layout. Wraps every page in <Auth0Provider> and renders the top
    nav (app name + Logout link). Sets the page <title>.

  app/page.js
    Patient list page (/). Server component — fetches session, redirects to
    login if missing, calls GET /api/patients. Renders patient table with
    detail links and the "Add Patient" button.

  app/patients/new/page.js
    New patient page (/patients/new). Server component — auth guard only.
    Renders the page shell and mounts NewPatientForm.

  app/patients/new/NewPatientForm.js
    Client form component. Collects name, DOB, sex, phone, email, initial
    measurements. Calls proxy POST /api/patients. Shows Zod validation errors
    inline. Redirects to new patient's detail page on success.

  app/patients/[id]/page.js
    Patient detail page (/patients/:id). Server component — fetches current
    patient + full SCD2 history in parallel. Renders stat cards, NoteForm,
    DeletePatientButton, and the vertical history timeline.

  app/patients/[id]/NoteForm.js
    Client component. Expandable "Add Note" form. Collects note type, content,
    follow-up date, updated measurements. Calls proxy POST, then router.refresh().

  app/patients/[id]/DeletePatientButton.js
    Client component. "Delete Patient" button that expands inline to a confirm
    step before calling DELETE /api/patients/:id. Redirects to list on success.

  app/api/patients/route.js
    Proxy: POST /api/patients. Adds Bearer token server-side and forwards body
    to backend. Reason: browser cannot hold the access token safely.

  app/api/patients/[patientId]/route.js
    Proxy: DELETE /api/patients/:patientId. Same pattern — adds auth header,
    forwards to backend, returns 204.

  app/api/patients/[patientId]/notes/route.js
    Proxy: POST /api/patients/:patientId/notes. Adds auth header, forwards
    note body, returns backend response unchanged.

migrations/
  001_initial_schema.sql       — All four tables + indexes
  002_patient_soft_delete.sql  — Adds is_active column + index to dim_patient
```

Full file-by-file descriptions with reasoning: see `docs/architecture.md` → File Reference section.

---

## Environment Variables

```
DATABASE_URL        postgresql://app_user:localpassword@localhost:5432/patient_records
AUTH0_DOMAIN        patient-records.au.auth0.com
AUTH0_CLIENT_ID     from Auth0 dashboard
AUTH0_CLIENT_SECRET from Auth0 dashboard
AUTH0_AUDIENCE      https://api.patientrecords.com
FGA_API_URL         http://localhost:8080
FGA_STORE_ID        from OpenFGA setup (changes on every docker restart)
FGA_MODEL_ID        from OpenFGA setup (changes on every docker restart)
NODE_ENV            development
PORT                3001
```

---

## API Conventions

- All routes prefixed with `/api`
- Success: `{ "data": { ... } }` or `{ "data": [ ... ] }`
- Error: `{ "error": "message" }`
- 400 validation, 401 no JWT, 403 FGA denied, 404 not found, 500 server error
- Pagination params: `page` (default 1), `limit` (default 20, max 100)

---

## Local Dev Commands

```bash
docker compose up -d           # start Postgres + OpenFGA
cd backend && npm run dev      # start backend on :3001 (nodemon)
cd frontend && npm run dev     # start frontend on :3000 (Turbopack)
docker compose down            # stop containers (data preserved in volume)
docker compose down -v         # stop and wipe all data
```
