CREATE TABLE patient_access_log (
  access_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable patient reference (not patient_dim_id) — we're logging who viewed
  -- the person's chart, not a specific SCD2 version
  patient_id   UUID        NOT NULL,

  staff_id     UUID        NOT NULL REFERENCES dim_staff(staff_id),
  practice_id  UUID        NOT NULL REFERENCES dim_practice(practice_id),

  accessed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_log_patient
  ON patient_access_log (patient_id, accessed_at DESC);
