-- Follow-up scheduling moves to real appointments (booked by reception),
-- not a date field the doctor sets on a clinical note.
ALTER TABLE patient_notes DROP COLUMN follow_up_date;

CREATE TABLE dim_appointment (
  appointment_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable patient reference, same denormalised pattern as patient_notes.patient_id —
  -- an appointment isn't tied to a specific SCD2 measurement snapshot
  patient_id        UUID        NOT NULL,

  staff_id          UUID        NOT NULL REFERENCES dim_staff(staff_id),
  practice_id       UUID        NOT NULL REFERENCES dim_practice(practice_id),

  scheduled_start   TIMESTAMPTZ NOT NULL,
  duration_minutes  INT         NOT NULL DEFAULT 30,

  status            TEXT        NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'cancelled')),
  appointment_type  TEXT        NOT NULL DEFAULT 'consultation'
                    CHECK (appointment_type IN ('consultation', 'follow_up', 'phone', 'procedure')),
  reason            TEXT,

  created_by        UUID        NOT NULL REFERENCES dim_staff(staff_id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointment_practice_day
  ON dim_appointment (practice_id, scheduled_start);

CREATE INDEX idx_appointment_patient
  ON dim_appointment (patient_id, scheduled_start DESC);
