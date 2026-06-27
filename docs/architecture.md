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

## Authorisation — OpenFGA

OpenFGA handles fine-grained access control. It answers the question:
"Is this doctor allowed to perform this action on this resource?"

Auth0 says who you are. OpenFGA says what you can do.

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

**Important:** OpenFGA uses in-memory storage locally. All tuples are lost on
container restart and must be re-seeded. See the local dev section below.

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
| OpenFGA    | Docker container via docker-compose (in-memory storage) |
| Backend    | `npm run dev` (nodemon — auto restart on file change) |
| Frontend   | `npm run dev` (Next.js Turbopack hot reload) |
| Auth0      | Same cloud tenant as production |

### OpenFGA re-seed after restart

Because OpenFGA runs with `OPENFGA_DATASTORE_ENGINE: memory`, all data is
wiped on container restart. After every `docker compose up`, run these steps:

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
written by the backend — no manual seeding needed for new patients.

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
│   └── architecture.md
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_patient_soft_delete.sql
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── db.js
│       ├── middleware/
│       │   ├── verifyJWT.js
│       │   ├── checkFGA.js
│       │   └── attachStaff.js
│       ├── routes/
│       │   ├── patients.js
│       │   ├── notes.js
│       │   └── staff.js
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
        ├── api/
        │   └── patients/
        │       ├── route.js                # proxy: POST /api/patients
        │       └── [patientId]/
        │           ├── route.js            # proxy: DELETE /api/patients/:id
        │           └── notes/
        │               └── route.js        # proxy: POST /api/patients/:id/notes
        └── patients/
            ├── new/
            │   ├── page.js                 # new patient page (auth guard)
            │   └── NewPatientForm.js       # client form component
            └── [id]/
                ├── page.js                 # patient detail + history timeline
                ├── NoteForm.js             # client component — add visit note
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
`OpenFgaClient.check()` to ask: "does `staff:<req.user.staff_id>` have
`<relation>` on `patient:<req.params.patientId>`?" Returns 403 if not.
This is what enforces practice-level data isolation at the access-control layer.

---

#### `src/routes/patients.js`
Five routes for patient CRUD:
- `GET /` — list all active patients for the staff member's practice (paginated, searchable)
- `GET /:patientId` — current patient version
- `POST /` — create patient, then write the OpenFGA `practice → patient` tuple so the new patient is immediately accessible
- `DELETE /:patientId` — soft delete (`is_active = false`) via `patientRepository.deactivate`
- `GET /:patientId/history` — all SCD2 versions with their notes, used for the timeline view

Also owns a local `OpenFgaClient` instance for writing tuples on patient creation.

#### `src/routes/notes.js`
Three routes, all nested under `/api/patients/:patientId/notes` (Express
`mergeParams: true` so `:patientId` is visible):
- `GET /` — all non-deleted notes for a patient, newest first
- `GET /:noteId` — single note with patient snapshot at time of writing
- `POST /` — validate with Zod, then call `noteRepository.create` which runs the SCD2 transaction

#### `src/routes/staff.js`
Single route: `GET /me`. Returns the logged-in staff member's record. Used by
the frontend to know who is logged in (name, role, practice). Does not require
`attachStaff` middleware — it resolves the staff itself and returns it.

---

#### `src/repositories/patientRepository.js`
All SQL for the `dim_patient` table:
- `findAllByPractice` — paginated list filtered by `practice_id`, `is_current = true`, `is_active = true`
- `findById` — current version of a single patient
- `findHistory` — all SCD2 version rows for a patient, with notes aggregated via `json_agg`
- `create` — inserts a new patient row with a generated `patient_id` UUID
- `deactivate` — sets `is_active = false` on all rows for a given `patient_id` + `practice_id`

#### `src/repositories/noteRepository.js`
All SQL for the `patient_notes` table, plus the SCD2 logic for `dim_patient`:
- `findAllByPatient` — all notes joined to their patient version and author
- `findById` — single note with full patient snapshot (all measurement fields)
- `create` — runs a three-step transaction: close current patient version, insert new version (carrying measurements forward), insert note referencing the new `patient_dim_id`. This always runs — even if no measurements changed — so every visit produces a new timeline entry.

#### `src/repositories/staffRepository.js`
Single function: `findByAuthUserId`. Looks up a `dim_staff` row by the Auth0
`sub` claim. Used by both `attachStaff` middleware and `GET /staff/me`.

---

#### `src/validators/patientValidator.js`
Zod schema for `POST /patients` request bodies. Required fields: `full_name`
(min 2 chars), `date_of_birth` (valid past date). Optional fields: `sex`
(enum), `phone`, `email`, `height_cm`, `weight_kg`, `bp_systolic`,
`bp_diastolic` with numeric range checks. Exported as `createPatientSchema`.

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
`@auth0/nextjs-auth0` v4 for the client SDK to work) and renders a minimal
top nav with the app name and a Logout link. Sets the page `<title>`.

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
session, then makes two parallel requests — `GET /api/patients/:id` (current
record) and `GET /api/patients/:id/history` (all versions with notes). Renders
the current measurements in stat cards, mounts `NoteForm` and
`DeletePatientButton`, then renders the full SCD2 history as a vertical
timeline with one card per visit.

#### `app/patients/[id]/NoteForm.js`
Client component (`'use client'`). An expandable "Add Note" form on the patient
detail page. Collapsed by default (shows only a button). When opened, collects
note type, content, optional follow-up date, and optional updated measurements.
Calls the Next.js proxy `POST /api/patients/:id/notes`. Closes and refreshes
the page via `router.refresh()` on success.

#### `app/patients/[id]/DeletePatientButton.js`
Client component (`'use client'`). Renders a "Delete Patient" button. On first
click, expands inline to show "Delete <name>?" with confirm/cancel buttons —
no modal, no page navigation. On confirm, calls `DELETE /api/patients/:id`
and redirects to the patient list on success. Shows an inline error message
if the request fails.

---

#### `app/api/patients/route.js`
Next.js API route — proxy for `POST /api/patients`. Reads the session
server-side, adds the `Authorization: Bearer <token>` header, and forwards
the request body to the Express backend. Returns the backend's response
(201 on success, 400 with Zod errors on validation failure). This exists
because the browser cannot hold the access token — the proxy adds it safely
on the server.

#### `app/api/patients/[patientId]/route.js`
Next.js API route — proxy for `DELETE /api/patients/:patientId`. Same pattern:
reads session, adds auth header, forwards to backend. Returns 204 on success.

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
