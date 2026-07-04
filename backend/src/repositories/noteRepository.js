const pool = require('../db');

async function findAllByPatient(patientId) {
  const { rows } = await pool.query(
    `SELECT
       n.note_id, n.patient_dim_id, n.visit_datetime, n.note_type,
       n.content,
       json_build_object(
         'staff_id', s.staff_id,
         'full_name', s.full_name
       ) AS written_by,
       json_build_object(
         'weight_kg',    p.weight_kg,
         'bp_systolic',  p.bp_systolic,
         'bp_diastolic', p.bp_diastolic
       ) AS patient_snapshot
     FROM patient_notes n
     JOIN dim_staff   s ON s.staff_id       = n.written_by
     JOIN dim_patient p ON p.patient_dim_id = n.patient_dim_id
     WHERE n.patient_id = $1 AND n.is_deleted = false
     ORDER BY n.visit_datetime DESC`,
    [patientId]
  );
  return rows;
}

async function findById(noteId) {
  const { rows } = await pool.query(
    `SELECT
       n.note_id, n.visit_datetime, n.note_type, n.content,
       json_build_object(
         'staff_id', s.staff_id,
         'full_name', s.full_name
       ) AS written_by,
       json_build_object(
         'full_name',    p.full_name,
         'birth_year',   EXTRACT(YEAR FROM p.date_of_birth)::int,
         'age',          EXTRACT(YEAR FROM AGE(p.date_of_birth))::int,
         'weight_kg',    p.weight_kg,
         'height_cm',    p.height_cm,
         'bp_systolic',  p.bp_systolic,
         'bp_diastolic', p.bp_diastolic
       ) AS patient_snapshot
     FROM patient_notes n
     JOIN dim_staff   s ON s.staff_id       = n.written_by
     JOIN dim_patient p ON p.patient_dim_id = n.patient_dim_id
     WHERE n.note_id = $1 AND n.is_deleted = false`,
    [noteId]
  );
  return rows[0] || null;
}

async function create(patientId, staffId, practiceId, data) {
  const { visit_datetime, note_type, content, measurements } = data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get the current patient version
    const { rows: currentRows } = await client.query(
      `SELECT patient_dim_id, full_name, date_of_birth, sex, phone, email,
              height_cm, weight_kg, bp_systolic, bp_diastolic
       FROM dim_patient
       WHERE patient_id = $1 AND is_current = true`,
      [patientId]
    );

    if (!currentRows.length) {
      throw new Error('Patient not found');
    }

    const current = currentRows[0];
    const m = measurements || {};

    // Always create a new patient version on every visit (SCD2)
    await client.query(
      `UPDATE dim_patient
       SET effective_to = now(), is_current = false
       WHERE patient_id = $1 AND is_current = true`,
      [patientId]
    );

    const { rows: newVersionRows } = await client.query(
      `INSERT INTO dim_patient
         (patient_id, practice_id, full_name, date_of_birth, sex, phone, email,
          height_cm, weight_kg, bp_systolic, bp_diastolic, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING patient_dim_id`,
      [
        patientId,
        practiceId,
        current.full_name,
        current.date_of_birth,
        current.sex,
        current.phone,
        current.email,
        m.height_cm    ?? current.height_cm,
        m.weight_kg    ?? current.weight_kg,
        m.bp_systolic  ?? current.bp_systolic,
        m.bp_diastolic ?? current.bp_diastolic,
        staffId,
      ]
    );

    const patientDimId = newVersionRows[0].patient_dim_id;

    // Insert the note against the current (or new) patient version
    const { rows: noteRows } = await client.query(
      `INSERT INTO patient_notes
         (patient_dim_id, patient_id, written_by, practice_id,
          visit_datetime, note_type, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING note_id, patient_dim_id, visit_datetime, note_type, content`,
      [
        patientDimId, patientId, staffId, practiceId,
        visit_datetime, note_type, content,
      ]
    );

    await client.query('COMMIT');
    return noteRows[0];

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { findAllByPatient, findById, create };
