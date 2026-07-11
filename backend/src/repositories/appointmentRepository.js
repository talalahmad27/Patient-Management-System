const pool = require('../db');

async function findClash(staffId, scheduledStart, durationMinutes) {
  const { rows } = await pool.query(
    `SELECT a.appointment_id, a.scheduled_start, p.full_name AS patient_name
     FROM dim_appointment a
     JOIN dim_patient p ON p.patient_id = a.patient_id AND p.is_current = true
     WHERE a.staff_id = $1
       AND a.status = 'scheduled'
       AND a.scheduled_start < $2::timestamptz + ($3::int * INTERVAL '1 minute')
       AND $2::timestamptz < a.scheduled_start + (a.duration_minutes * INTERVAL '1 minute')
     LIMIT 1`,
    [staffId, scheduledStart, durationMinutes]
  );
  return rows[0] || null;
}

async function create(practiceId, createdBy, data) {
  const {
    patient_id, staff_id, scheduled_start,
    duration_minutes, appointment_type, reason,
  } = data;
  const duration = duration_minutes || 30;

  const { rows } = await pool.query(
    `INSERT INTO dim_appointment
       (patient_id, staff_id, practice_id, scheduled_start,
        duration_minutes, appointment_type, reason, created_by)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE EXISTS (SELECT 1 FROM dim_patient WHERE patient_id = $1 AND practice_id = $3 AND is_active = true)
       AND EXISTS (SELECT 1 FROM dim_staff   WHERE staff_id   = $2 AND practice_id = $3 AND is_active = true)
       AND NOT EXISTS (
         SELECT 1 FROM dim_appointment existing
         WHERE existing.staff_id = $2
           AND existing.status = 'scheduled'
           AND existing.scheduled_start < $4::timestamptz + ($5::int * INTERVAL '1 minute')
           AND $4::timestamptz < existing.scheduled_start + (existing.duration_minutes * INTERVAL '1 minute')
       )
     RETURNING *`,
    [
      patient_id, staff_id, practiceId, scheduled_start,
      duration, appointment_type || 'consultation', reason || null, createdBy,
    ]
  );

  if (rows[0]) return { appointment: rows[0] };

  // Insert was blocked — figure out why so the caller can give a specific error
  const clash = await findClash(staff_id, scheduled_start, duration);
  if (clash) return { error: 'clash', clash };
  return { error: 'not_found' };
}

async function findByDay(practiceId, date) {
  const { rows } = await pool.query(
    `SELECT
       a.appointment_id, a.patient_id, a.staff_id, a.scheduled_start,
       a.duration_minutes, a.status, a.appointment_type, a.reason,
       p.full_name AS patient_name,
       s.full_name AS staff_name
     FROM dim_appointment a
     JOIN dim_patient p ON p.patient_id = a.patient_id AND p.is_current = true
     JOIN dim_staff   s ON s.staff_id   = a.staff_id
     WHERE a.practice_id = $1
       AND a.scheduled_start >= $2::date
       AND a.scheduled_start < $2::date + INTERVAL '1 day'
     ORDER BY a.scheduled_start ASC`,
    [practiceId, date]
  );
  return rows;
}

// Open (still 'scheduled') appointments for a patient — both upcoming and any
// that are past-due but haven't been given an outcome yet, so reception can
// still complete / no-show them from the patient tab. Finalised appointments
// (completed / no_show / cancelled) drop off.
async function findOpenByPatient(patientId, practiceId) {
  const { rows } = await pool.query(
    `SELECT
       a.appointment_id, a.patient_id, a.staff_id, a.scheduled_start,
       a.duration_minutes, a.status, a.appointment_type, a.reason,
       s.full_name AS staff_name
     FROM dim_appointment a
     JOIN dim_staff s ON s.staff_id = a.staff_id
     WHERE a.patient_id = $1 AND a.practice_id = $2
       AND a.status = 'scheduled'
     ORDER BY a.scheduled_start ASC`,
    [patientId, practiceId]
  );
  return rows;
}

async function cancel(appointmentId, practiceId) {
  const { rows } = await pool.query(
    `UPDATE dim_appointment
     SET status = 'cancelled'
     WHERE appointment_id = $1 AND practice_id = $2 AND status = 'scheduled'
     RETURNING *`,
    [appointmentId, practiceId]
  );
  return rows[0] || null;
}

async function findById(appointmentId, practiceId) {
  const { rows } = await pool.query(
    `SELECT * FROM dim_appointment WHERE appointment_id = $1 AND practice_id = $2`,
    [appointmentId, practiceId]
  );
  return rows[0] || null;
}

// Forward outcome from a scheduled appointment (admin + receptionist).
// status is 'completed' or 'no_show'. Guard mirrors cancel(): the transition
// only fires from 'scheduled', and only once the start time has passed — both
// outcomes are retrospective, you can't complete or no-show a future slot.
async function markOutcome(appointmentId, practiceId, status) {
  const { rows } = await pool.query(
    `UPDATE dim_appointment
     SET status = $3
     WHERE appointment_id = $1 AND practice_id = $2
       AND status = 'scheduled'
       AND scheduled_start <= now()
     RETURNING *`,
    [appointmentId, practiceId, status]
  );
  return rows[0] || null;
}

// Admin-only correction of an already-finalised appointment. Permissive on the
// source status (that's the point of a correction), but still refuses to mark a
// future appointment 'completed' — nonsensical regardless of role.
async function correctStatus(appointmentId, practiceId, status) {
  const { rows } = await pool.query(
    `UPDATE dim_appointment
     SET status = $3
     WHERE appointment_id = $1 AND practice_id = $2
       AND ($3 <> 'completed' OR scheduled_start <= now())
     RETURNING *`,
    [appointmentId, practiceId, status]
  );
  return rows[0] || null;
}

module.exports = {
  create, findByDay, findOpenByPatient, cancel, findClash,
  findById, markOutcome, correctStatus,
};
