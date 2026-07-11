-- Appointment outcome tracking. Status expands from scheduled/cancelled to
-- capture what actually happened at the visit, so a completed appointment can
-- later be linked to a payment (only 'completed' appointments are billable).
--
-- Lifecycle (no waiting-room / live-tracking states, by design):
--   scheduled ──▶ completed   (patient came and saw the doctor → billable)
--            ├──▶ no_show      (patient did not attend)
--            └──▶ cancelled    (already existed)
--
-- completed/no_show can only be set once the appointment start time has passed,
-- and only from 'scheduled'. Correcting a finalised appointment is admin-only —
-- both rules are enforced in the repository/route, not the CHECK constraint.

ALTER TABLE dim_appointment
  DROP CONSTRAINT IF EXISTS dim_appointment_status_check;

ALTER TABLE dim_appointment
  ADD CONSTRAINT dim_appointment_status_check
  CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled'));
