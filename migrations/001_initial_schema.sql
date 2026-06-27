-- Migration 001 — initial schema

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

CREATE TABLE dim_patient (
  patient_dim_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        NOT NULL,
  practice_id     UUID        NOT NULL REFERENCES dim_practice(practice_id),
  full_name       TEXT        NOT NULL,
  date_of_birth   DATE        NOT NULL,
  sex             TEXT        CHECK (sex IN ('male', 'female', 'other')),
  phone           TEXT,
  email           TEXT,
  height_cm       NUMERIC(5,1),
  weight_kg       NUMERIC(5,1),
  bp_systolic     SMALLINT,
  bp_diastolic    SMALLINT,
  s3_object_id    TEXT,
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to    TIMESTAMPTZ,
  is_current      BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID        REFERENCES dim_staff(staff_id)
);

CREATE UNIQUE INDEX idx_patient_current
  ON dim_patient (patient_id)
  WHERE is_current = true;

CREATE INDEX idx_patient_history
  ON dim_patient (patient_id, effective_from DESC);

CREATE INDEX idx_patient_practice
  ON dim_patient (practice_id, is_current);

CREATE TABLE patient_notes (
  note_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_dim_id  UUID        NOT NULL REFERENCES dim_patient(patient_dim_id),
  patient_id      UUID        NOT NULL,
  written_by      UUID        NOT NULL REFERENCES dim_staff(staff_id),
  practice_id     UUID        NOT NULL REFERENCES dim_practice(practice_id),
  visit_datetime  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note_type       TEXT        NOT NULL DEFAULT 'consultation'
                  CHECK (note_type IN ('consultation', 'follow_up', 'phone', 'procedure')),
  content         TEXT        NOT NULL,
  follow_up_date  DATE,
  s3_object_id    TEXT,
  is_deleted      BOOLEAN     NOT NULL DEFAULT false,
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
