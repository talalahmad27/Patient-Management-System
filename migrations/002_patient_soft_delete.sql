-- Migration 002 — soft delete for patients

ALTER TABLE dim_patient
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX idx_patient_active
  ON dim_patient (practice_id, is_active, is_current);
