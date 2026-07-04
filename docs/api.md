# API Documentation — Patient Record System

## Base URL

```
Local:       http://localhost:3001/api
Production:  https://api.yourapp.com/api
```

## Authentication

Every endpoint (except `/health`) requires a valid JWT in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

The JWT is issued by Auth0 on login. The backend verifies it on every request
using Auth0's JWKS endpoint. The `sub` claim from the JWT is used to look up
the staff member in `dim_staff.auth_user_id`.

## Authorisation

Two independent checks, both must pass:

- **OpenFGA** — patient/note endpoints check the requesting staff member
  belongs to the practice that owns the patient. A 403 is returned if not.
  Skipped entirely for staff with `role: 'admin'`.
- **DB role** — checked via two middlewares. `requireAdmin` gates
  `/api/admin/*` routes (admin only). `checkRole(...allowedRoles)` gates
  specific patient/note actions by role — currently used to block the
  `receptionist` role from clinical notes, visit history, and patient
  deletion (`checkRole('admin', 'doctor', 'nurse')`). Both return 403 if the
  role check fails.

See `docs/architecture-decisions.md` for the full two-layer model and the
role → action access matrix.

## Response format

All responses follow this shape:

```json
{ "data": { ... } }          // success — single object
{ "data": [ ... ] }          // success — list
{ "error": "message" }       // error
```

---

## Endpoints

### Health

#### GET /health
No auth required. Returns 200 if the server is running.

```json
{ "status": "ok" }
```

---

### Staff

#### GET /staff/me
Returns the currently logged-in staff member derived from the JWT.

**Auth:** JWT required

**Response 200**
```json
{
  "data": {
    "staff_id": "uuid",
    "practice_id": "uuid",
    "full_name": "Dr. Alice Chen",
    "email": "alice@sunrise.com.au",
    "staff_type": "doctor",
    "specialty": "GP",
    "role": "doctor",
    "is_active": true
  }
}
```

---

#### GET /staff
Returns all active staff members in the logged-in staff member's practice,
sorted by role then name. Unlike `GET /admin/staff`, this is open to every
role — it exists so any staff member (in practice, the receptionist booking
an appointment) can populate a picker of colleagues, not for managing staff
accounts.

**Auth:** JWT required

**Response 200**
```json
{
  "data": [
    {
      "staff_id": "uuid",
      "full_name": "Dr. Alice Chen",
      "preferred_name": "Alice",
      "email": "alice@sunrise.com.au",
      "staff_type": "doctor",
      "specialty": "GP",
      "role": "doctor",
      "is_active": true
    }
  ]
}
```

---

### Admin

Requires `dim_staff.role === 'admin'`. Enforced by `requireAdmin` middleware,
which runs after `verifyJWT` + `attachStaff`.

#### GET /admin/staff
Returns all active staff members in the logged-in admin's practice, sorted
by role then name.

**Auth:** JWT required | **Role:** admin

**Response 200**
```json
{
  "data": [
    {
      "staff_id": "uuid",
      "full_name": "Dr. Test Doctor",
      "preferred_name": "Test",
      "email": "test.doctor@testclinic.com",
      "staff_type": "doctor",
      "specialty": "GP",
      "role": "admin",
      "is_active": true
    }
  ]
}
```

**Response 403** — logged-in staff member is not an admin

---

### Patients

#### GET /patients
Returns all active, current patient records for the logged-in doctor's practice.

**Auth:** JWT required

**Query params**

| Param    | Type   | Description |
|----------|--------|-------------|
| `search` | string | Filter by patient name (optional) |
| `page`   | number | Page number, default 1 |
| `limit`  | number | Results per page, default 20, max 100 |

**Response 200**
```json
{
  "data": [
    {
      "patient_id": "uuid",
      "full_name": "Jane Smith",
      "date_of_birth": "1985-04-12",
      "sex": "female",
      "phone": "0412 000 000",
      "last_visit": "2024-11-03T14:10:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 148
  }
}
```

---

#### GET /patients/:patientId
Returns the current version of a patient record.

Also records this view in `patient_access_log` (who + when), and returns who
had last checked the chart *before* this view (`null` if nobody has viewed it
yet). The lookup happens before the new row is inserted, so the response
always reflects the previous viewer, not the current one.

**Auth:** JWT required | **FGA:** can_read patient

**Response 200**
```json
{
  "data": {
    "patient_dim_id": "uuid",
    "patient_id": "uuid",
    "practice_id": "uuid",
    "full_name": "Jane Smith",
    "date_of_birth": "1985-04-12",
    "sex": "female",
    "phone": "0412 000 000",
    "email": "jane@example.com",
    "height_cm": 168.0,
    "weight_kg": 74.5,
    "bp_systolic": 132,
    "bp_diastolic": 85,
    "effective_from": "2024-11-03T14:10:00Z",
    "created_at": "2024-01-10T09:00:00Z",
    "last_accessed_by": {
      "staff_id": "uuid",
      "full_name": "Dr. Alice Chen",
      "accessed_at": "2024-11-03T12:05:00Z"
    }
  }
}
```

**Response 403** — doctor does not belong to this patient's practice  
**Response 404** — patient not found

---

#### POST /patients
Creates a new patient under the logged-in doctor's practice.

After inserting the patient row, the backend automatically writes an OpenFGA
tuple so the patient is immediately accessible via `can_read`/`can_write`:

```
practice:<practiceId>  practice  patient:<newPatientId>
```

**Auth:** JWT required

**Request body**
```json
{
  "full_name": "Jane Smith",
  "date_of_birth": "1985-04-12",
  "sex": "female",
  "phone": "0412 000 000",
  "email": "jane@example.com",
  "height_cm": 168.0,
  "weight_kg": 72.0,
  "bp_systolic": 118,
  "bp_diastolic": 76
}
```

**Validation rules**
- `full_name` — required, min 2 chars
- `date_of_birth` — required, valid date, not in the future
- `sex` — optional, one of: male, female, other
- `height_cm` — optional, number between 50 and 250
- `weight_kg` — optional, number between 1 and 300
- `bp_systolic` — optional, integer between 60 and 250
- `bp_diastolic` — optional, integer between 40 and 150

**Response 201**
```json
{
  "data": {
    "patient_dim_id": "uuid",
    "patient_id": "uuid",
    "full_name": "Jane Smith",
    ...
  }
}
```

---

#### PATCH /patients/:patientId
Updates a patient's demographic details — `full_name`, `birth_year`, `sex`,
`phone`, `email`. Updates the current `dim_patient` row directly (no SCD2
version, no measurements, no notes touched — this isn't a clinical visit).
Open to every role, including `receptionist` — this is the endpoint that
lets front-desk staff fix a patient's contact details once they're blocked
from the clinical note flow below.

**Auth:** JWT required | **FGA:** can_write patient

**Request body** (all fields optional, at least one required)
```json
{
  "full_name": "Jane Smith",
  "birth_year": 1985,
  "sex": "female",
  "phone": "0400 111 222",
  "email": "jane@example.com"
}
```

**Response 200**
```json
{
  "data": {
    "patient_dim_id": "uuid",
    "patient_id": "uuid",
    "full_name": "Jane Smith",
    "birth_year": 1985,
    "age": 41,
    "sex": "female",
    "phone": "0400 111 222",
    "email": "jane@example.com",
    "height_cm": 168.0,
    "weight_kg": 74.5,
    "bp_systolic": 132,
    "bp_diastolic": 85,
    "effective_from": "2024-11-03T14:10:00Z",
    "created_at": "2024-01-10T09:00:00Z"
  }
}
```

**Response 400** — no fields provided, or a field fails validation  
**Response 403** — doctor does not belong to this patient's practice  
**Response 404** — patient not found

---

#### DELETE /patients/:patientId
Soft-deletes a patient by setting `is_active = false` on all their `dim_patient`
rows. The patient disappears from the list and detail views immediately.
No data is physically removed — the full SCD2 history and all notes are
preserved in the database.

**Auth:** JWT required | **Role:** admin, doctor, or nurse (not receptionist) | **FGA:** can_write patient

**Response 204** — no body  
**Response 403** — doctor does not belong to this patient's practice, or role is `receptionist`  
**Response 404** — patient not found

---

#### GET /patients/:patientId/history
Returns all versions of the patient — every visit with its measurements and notes.
Used to render the history timeline on the frontend.

**Auth:** JWT required | **Role:** admin, doctor, or nurse (not receptionist) | **FGA:** can_read patient

**Response 200**
```json
{
  "data": [
    {
      "patient_dim_id": "uuid",
      "effective_from": "2024-11-03T14:10:00Z",
      "effective_to": null,
      "is_current": true,
      "weight_kg": 74.5,
      "bp_systolic": 132,
      "bp_diastolic": 85,
      "height_cm": 168.0,
      "notes": [
        {
          "note_id": "uuid",
          "note_type": "consultation",
          "content": "Weight up 2.5kg. Discussed diet. Monitor BP.",
          "visit_datetime": "2024-11-03T14:10:00Z",
          "written_by": "Dr. Alice Chen"
        }
      ]
    },
    {
      "patient_dim_id": "uuid",
      "effective_from": "2024-01-10T09:00:00Z",
      "effective_to": "2024-11-03T14:10:00Z",
      "is_current": false,
      "weight_kg": 72.0,
      "bp_systolic": 118,
      "bp_diastolic": 76,
      "notes": []
    }
  ]
}
```

---

### Notes

#### GET /patients/:patientId/notes
Returns all notes for a patient, newest first.

**Auth:** JWT required | **Role:** admin, doctor, or nurse (not receptionist) | **FGA:** can_read patient

**Response 200**
```json
{
  "data": [
    {
      "note_id": "uuid",
      "patient_dim_id": "uuid",
      "visit_datetime": "2024-11-03T14:10:00Z",
      "note_type": "consultation",
      "content": "Weight up 2.5kg. Discussed diet. Monitor BP.",
      "written_by": {
        "staff_id": "uuid",
        "full_name": "Dr. Alice Chen"
      },
      "patient_snapshot": {
        "weight_kg": 74.5,
        "bp_systolic": 132,
        "bp_diastolic": 85
      }
    }
  ]
}
```

---

#### POST /patients/:patientId/notes
Creates a new note for a patient visit. Always creates a new patient version
(SCD2) before inserting the note — regardless of whether measurements changed.
All three writes (close old version, insert new version, insert note) happen
in a single transaction. Note: there is no `follow_up_date` field — follow-up
scheduling is a real appointment booked by reception (see the Appointments
section below), not a date on the note.

**Auth:** JWT required | **Role:** admin, doctor, or nurse (not receptionist) | **FGA:** can_write patient

**Request body**
```json
{
  "visit_datetime": "2024-11-03T14:10:00Z",
  "note_type": "consultation",
  "content": "Weight up 2.5kg. Discussed diet. Monitor BP.",
  "measurements": {
    "weight_kg": 74.5,
    "bp_systolic": 132,
    "bp_diastolic": 85,
    "height_cm": 168.0
  }
}
```

**Validation rules**
- `visit_datetime` — required, valid datetime
- `note_type` — required, one of: consultation, follow_up, phone, procedure
- `content` — required, min 1 char
- `measurements` — optional; if provided, values are carried into the new version

**What happens internally**
1. Fetch current patient version
2. Close current version: `UPDATE dim_patient SET effective_to = now(), is_current = false`
3. Insert new version with provided measurements (or carry forward existing)
4. Insert note referencing the new `patient_dim_id`
5. All steps in one transaction — any failure rolls back everything

**Response 201**
```json
{
  "data": {
    "note_id": "uuid",
    "patient_dim_id": "uuid",
    "visit_datetime": "2024-11-03T14:10:00Z",
    "note_type": "consultation",
    "content": "Weight up 2.5kg. Discussed diet. Monitor BP."
  }
}
```

---

#### GET /patients/:patientId/notes/:noteId
Returns a single note with the patient snapshot at time of writing.

**Auth:** JWT required | **Role:** admin, doctor, or nurse (not receptionist) | **FGA:** can_read patient

**Response 200**
```json
{
  "data": {
    "note_id": "uuid",
    "visit_datetime": "2024-11-03T14:10:00Z",
    "note_type": "consultation",
    "content": "Weight up 2.5kg. Discussed diet. Monitor BP.",
    "written_by": {
      "staff_id": "uuid",
      "full_name": "Dr. Alice Chen"
    },
    "patient_snapshot": {
      "full_name": "Jane Smith",
      "date_of_birth": "1985-04-12",
      "weight_kg": 74.5,
      "height_cm": 168.0,
      "bp_systolic": 132,
      "bp_diastolic": 85
    }
  }
}
```

---

## Error codes

| Status | Meaning |
|--------|---------|
| 400 | Validation failed — check the request body |
| 401 | Missing or invalid JWT |
| 403 | Valid JWT but OpenFGA denied access |
| 404 | Resource not found |
| 500 | Unexpected server error |
