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

async function findUpcomingByPatient(patientId, practiceId) {
  const { rows } = await pool.query(
    `SELECT
       a.appointment_id, a.patient_id, a.staff_id, a.scheduled_start,
       a.duration_minutes, a.status, a.appointment_type, a.reason,
       s.full_name AS staff_name
     FROM dim_appointment a
     JOIN dim_staff s ON s.staff_id = a.staff_id
     WHERE a.patient_id = $1 AND a.practice_id = $2
       AND a.status = 'scheduled' AND a.scheduled_start >= now()
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

module.exports = { create, findByDay, findUpcomingByPatient, cancel, findClash };
