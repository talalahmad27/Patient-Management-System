# Database Schema — Patient Record System

## Overview

Four tables. PostgreSQL 16.

```
dim_practice
    │
    ├── dim_staff          (practice_id → dim_practice)
    │
    └── dim_patient        (practice_id → dim_practice)  ← SCD Type 2
              │
              └── patient_notes  (patient_dim_id → dim_patient)
                                 (patient_id     → stable natural key)
                                 (written_by     → dim_staff)
```

---

## Migrations


| File                          | Description                                      |
| ----------------------------- | ------------------------------------------------ |
| `001_initial_schema.sql`      | All four tables, indexes                         |
| `002_patient_soft_delete.sql` | Adds `is_active` column + index to `dim_patient` |


---

## SCD Type 2 — How It Works

`dim_patient` is a Slowly Changing Dimension Type 2 table. Every visit note
creates a new versioned patient row — regardless of whether measurements changed.
This gives the history timeline one card per visit.

On every note create:

1. Close the current row: set `effective_to = now()`, `is_current = false`
2. Insert a new row carrying the latest (or unchanged) measurements: `effective_to = NULL`, `is_current = true`
3. Insert the note referencing the new `patient_dim_id`

All three steps happen inside a single BEGIN/COMMIT transaction.

Two key IDs exist on every patient record:


| Column           | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `patient_dim_id` | Unique per version (surrogate key). Changes every visit. |
| `patient_id`     | Stable across all versions (natural key). Never changes. |


`patient_notes` carries both — `patient_dim_id` pins a note to the exact
measurement snapshot it was written against. `patient_id` allows simple
"all notes for this patient" queries without chasing SCD2 rows.

---

## Tables

### dim_practice

Represents one medical practice or clinic.

```sql
CREATE TABLE dim_practice (
  practice_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_name   TEXT        NOT NULL,
  abn             TEXT,
  phone           TEXT,
  email           TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  suburb          TEXT,
  state           TEXT,
  postcode        TEXT,
  country         TEXT        NOT NULL DEFAULT 'AU',
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```


| Column        | Notes                                                           |
| ------------- | --------------------------------------------------------------- |
| `practice_id` | Primary key. Referenced by all other tables.                    |
| `abn`         | Australian Business Number. Used for billing integration later. |
| `is_active`   | Soft disable a practice without deleting linked records.        |


---

### dim_staff

Represents a doctor or admin staff member linked to a practice.

```sql
CREATE TABLE dim_staff (
  staff_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID        NOT NULL REFERENCES dim_practice(practice_id),
  auth_user_id    TEXT        UNIQUE NOT NULL,
  full_name       TEXT        NOT NULL,
  preferred_name  TEXT,
  email           TEXT        UNIQUE NOT NULL,
  phone           TEXT,
  staff_type      TEXT        NOT NULL CHECK (staff_type IN ('doctor', 'admin')),
  provider_number TEXT,
  specialty       TEXT,
  ahpra_number    TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```


| Column            | Notes                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `auth_user_id`    | The `sub` claim from the Auth0 JWT. Links a login session to a staff row. |
| `staff_type`      | `doctor` or `admin`. CHECK constraint enforced at DB level.               |
| `provider_number` | Medicare provider number. Nullable — doctors only.                        |
| `ahpra_number`    | AHPRA medical registration number. AU compliance.                         |


---

### dim_patient

SCD Type 2 table. One row per patient version. Every visit creates a new row.

```sql
CREATE TABLE dim_patient (
  -- SCD Type 2 keys
  patient_dim_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        NOT NULL,

  -- Practice
  practice_id     UUID        NOT NULL REFERENCES dim_practice(practice_id),

  -- Demographics
  full_name       TEXT        NOT NULL,
  date_of_birth   DATE        NOT NULL,
  sex             TEXT        CHECK (sex IN ('male', 'female', 'other')),
  phone           TEXT,
  email           TEXT,

  -- Clinical measurements (versioned)
  height_cm       NUMERIC(5,1),
  weight_kg       NUMERIC(5,1),
  bp_systolic     SMALLINT,
  bp_diastolic    SMALLINT,

  -- Future file placeholder
  s3_object_id    TEXT,

  -- SCD Type 2 control
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to    TIMESTAMPTZ,
  is_current      BOOLEAN     NOT NULL DEFAULT true,

  -- Soft delete (added in migration 002)
  is_active       BOOLEAN     NOT NULL DEFAULT true,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID        REFERENCES dim_staff(staff_id)
);

-- Enforces only ONE current row per patient at the DB level
CREATE UNIQUE INDEX idx_patient_current
  ON dim_patient (patient_id)
  WHERE is_current = true;

CREATE INDEX idx_patient_history
  ON dim_patient (patient_id, effective_from DESC);

CREATE INDEX idx_patient_practice
  ON dim_patient (practice_id, is_current);

-- Added in migration 002
CREATE INDEX idx_patient_active
  ON dim_patient (practice_id, is_active, is_current);
```


| Column           | Notes                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| `patient_dim_id` | Surrogate key. Unique per version row.                                         |
| `patient_id`     | Natural key. Same UUID across all versions of one patient.                     |
| `effective_from` | When this version became active.                                               |
| `effective_to`   | When this version was superseded. NULL means currently active.                 |
| `is_current`     | Fast filter shortcut. Partial unique index prevents duplicates.                |
| `is_active`      | Soft delete flag. Set to `false` to hide from all queries. Never hard deleted. |
| `s3_object_id`   | Null for v1. Column exists so schema needs no change when files are added.     |


---

### patient_notes

One row per visit note. References the exact patient version it was written
against via `patient_dim_id`.

```sql
CREATE TABLE patient_notes (
  note_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to exact patient version at time of writing
  patient_dim_id  UUID        NOT NULL REFERENCES dim_patient(patient_dim_id),

  -- Stable patient reference for simple history queries
  patient_id      UUID        NOT NULL,

  -- Who wrote it
  written_by      UUID        NOT NULL REFERENCES dim_staff(staff_id),
  practice_id     UUID        NOT NULL REFERENCES dim_practice(practice_id),

  -- Visit details
  visit_datetime  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note_type       TEXT        NOT NULL DEFAULT 'consultation'
                  CHECK (note_type IN ('consultation', 'follow_up', 'phone', 'procedure')),
  content         TEXT        NOT NULL,
  follow_up_date  DATE,

  -- Future attachment placeholder
  s3_object_id    TEXT,

  -- Soft delete
  is_deleted      BOOLEAN     NOT NULL DEFAULT false,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_patient
  ON patient_notes (patient_id, visit_datetime DESC)
  WHERE is_deleted = false;

CREATE INDEX idx_notes_dim
  ON patient_notes (patient_dim_id)
  WHERE is_deleted = false;

CREATE INDEX idx_notes_practice
  ON patient_notes (practice_id, visit_datetime DESC)
  WHERE is_deleted = false;
```


| Column           | Notes                                                                     |
| ---------------- | ------------------------------------------------------------------------- |
| `patient_dim_id` | FK to the exact patient version. Pins the note to a measurement snapshot. |
| `patient_id`     | Denormalised stable key. Makes "all notes for patient" queries simple.    |
| `note_type`      | CHECK constraint — valid values enforced at DB level.                     |
| `content`        | Free text in v1. Future: add `soap JSONB` column alongside this.          |
| `is_deleted`     | Soft delete only. Medical notes are never hard deleted.                   |


---

## Soft Delete Rules


| Table           | Mechanism           | What it hides                               |
| --------------- | ------------------- | ------------------------------------------- |
| `dim_patient`   | `is_active = false` | Patient hidden from all list/detail queries |
| `patient_notes` | `is_deleted = true` | Note hidden from all read queries           |


Neither table ever has rows physically removed.

---

## Key Query Patterns

### Get current patient record

```sql
SELECT * FROM dim_patient
WHERE patient_id = $1 AND is_current = true AND is_active = true;
```

### Get full visit history for a patient

```sql
SELECT
  p.patient_dim_id, p.effective_from, p.effective_to, p.is_current,
  p.weight_kg, p.bp_systolic, p.bp_diastolic, p.height_cm,
  json_agg(...) AS notes
FROM dim_patient p
LEFT JOIN patient_notes n ON n.patient_dim_id = p.patient_dim_id AND n.is_deleted = false
LEFT JOIN dim_staff s ON s.staff_id = n.written_by
WHERE p.patient_id = $1
GROUP BY p.patient_dim_id, ...
ORDER BY p.effective_from DESC;
```

### Write a new visit (always in a transaction)

```sql
BEGIN;

-- 1. Close current patient version (always, every visit)
UPDATE dim_patient
SET effective_to = now(), is_current = false
WHERE patient_id = $1 AND is_current = true;

-- 2. Insert new patient version (measurements carried forward if not provided)
INSERT INTO dim_patient (patient_id, practice_id, full_name, date_of_birth,
  height_cm, weight_kg, bp_systolic, bp_diastolic, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING patient_dim_id;

-- 3. Insert note against the new patient_dim_id
INSERT INTO patient_notes (patient_dim_id, patient_id, written_by,
  practice_id, visit_datetime, note_type, content, follow_up_date)
VALUES ($new_dim_id, $1, $doctor_id, $2, now(), $type, $content, $follow_up);

COMMIT;
```

### Soft delete a patient

```sql
UPDATE dim_patient
SET is_active = false
WHERE patient_id = $1 AND practice_id = $2;
```

