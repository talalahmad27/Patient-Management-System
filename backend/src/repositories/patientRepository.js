const pool = require('../db');

async function findAllByPractice(practiceId, { search, page, limit }) {
  const offset = (page - 1) * limit;
  const searchParam = search ? `%${search}%` : '%';

  const { rows } = await pool.query(
    `SELECT
       p.patient_id, p.full_name,
       EXTRACT(YEAR FROM p.date_of_birth)::int AS birth_year,
       EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age,
       p.sex, p.phone,
       MAX(n.visit_datetime) AS last_visit
     FROM dim_patient p
     LEFT JOIN patient_notes n ON n.patient_id = p.patient_id AND n.is_deleted = false
     WHERE p.practice_id = $1
       AND p.is_current = true
       AND p.is_active = true
       AND p.full_name ILIKE $2
     GROUP BY p.patient_id, p.full_name, p.date_of_birth, p.sex, p.phone
     ORDER BY p.full_name ASC
     LIMIT $3 OFFSET $4`,
    [practiceId, searchParam, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM dim_patient
     WHERE practice_id = $1 AND is_current = true AND is_active = true AND full_name ILIKE $2`,
    [practiceId, searchParam]
  );

  return { patients: rows, total: parseInt(countRows[0].count) };
}

async function findById(patientId) {
  const { rows } = await pool.query(
    `SELECT patient_dim_id, patient_id, practice_id, full_name,
            EXTRACT(YEAR FROM date_of_birth)::int AS birth_year,
            EXTRACT(YEAR FROM AGE(date_of_birth))::int AS age,
            sex, phone, email, height_cm, weight_kg, bp_systolic, bp_diastolic,
            effective_from, created_at
     FROM dim_patient
     WHERE patient_id = $1 AND is_current = true`,
    [patientId]
  );
  return rows[0] || null;
}

async function findHistory(patientId) {
  const { rows } = await pool.query(
    `SELECT
       p.patient_dim_id, p.effective_from, p.effective_to, p.is_current,
       p.weight_kg, p.bp_systolic, p.bp_diastolic, p.height_cm,
       COALESCE(
         json_agg(
           json_build_object(
             'note_id',       n.note_id,
             'note_type',     n.note_type,
             'content',       n.content,
             'visit_datetime',n.visit_datetime,
             'written_by',    s.full_name,
             'follow_up_date',to_char(n.follow_up_date, 'DD/MM/YYYY')
           ) ORDER BY n.visit_datetime DESC
         ) FILTER (WHERE n.note_id IS NOT NULL),
         '[]'
       ) AS notes
     FROM dim_patient p
     LEFT JOIN patient_notes n ON n.patient_dim_id = p.patient_dim_id AND n.is_deleted = false
     LEFT JOIN dim_staff s ON s.staff_id = n.written_by
     WHERE p.patient_id = $1
     GROUP BY p.patient_dim_id, p.effective_from, p.effective_to, p.is_current,
              p.weight_kg, p.bp_systolic, p.bp_diastolic, p.height_cm
     ORDER BY p.effective_from DESC`,
    [patientId]
  );
  return rows;
}

async function create(practiceId, staffId, data) {
  const {
    full_name, date_of_birth, sex, phone, email,
    height_cm, weight_kg, bp_systolic, bp_diastolic
  } = data;

  const { rows } = await pool.query(
    `INSERT INTO dim_patient
       (patient_id, practice_id, full_name, date_of_birth, sex, phone, email,
        height_cm, weight_kg, bp_systolic, bp_diastolic, created_by)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [practiceId, full_name, date_of_birth, sex || null, phone || null, email || null,
     height_cm || null, weight_kg || null, bp_systolic || null, bp_diastolic || null, staffId]
  );
  return rows[0];
}

async function updateDemographics(patientId, practiceId, data) {
  const { full_name, date_of_birth, sex, phone, email } = data;

  const { rows } = await pool.query(
    `UPDATE dim_patient
     SET full_name     = COALESCE($1, full_name),
         date_of_birth = COALESCE($2, date_of_birth),
         sex           = COALESCE($3, sex),
         phone         = COALESCE($4, phone),
         email         = COALESCE($5, email)
     WHERE patient_id = $6 AND practice_id = $7 AND is_current = true
     RETURNING patient_dim_id, patient_id, practice_id, full_name,
               EXTRACT(YEAR FROM date_of_birth)::int AS birth_year,
               EXTRACT(YEAR FROM AGE(date_of_birth))::int AS age,
               sex, phone, email, height_cm, weight_kg, bp_systolic, bp_diastolic,
               effective_from, created_at`,
    [full_name || null, date_of_birth || null, sex || null, phone || null, email || null, patientId, practiceId]
  );
  return rows[0] || null;
}

async function deactivate(patientId, practiceId) {
  const { rowCount } = await pool.query(
    `UPDATE dim_patient
     SET is_active = false
     WHERE patient_id = $1 AND practice_id = $2`,
    [patientId, practiceId]
  );
  return rowCount > 0;
}

async function findLastAccess(patientId) {
  const { rows } = await pool.query(
    `SELECT s.staff_id, s.full_name, a.accessed_at
     FROM patient_access_log a
     JOIN dim_staff s ON s.staff_id = a.staff_id
     WHERE a.patient_id = $1
     ORDER BY a.accessed_at DESC
     LIMIT 1`,
    [patientId]
  );
  return rows[0] || null;
}

async function logAccess(patientId, staffId, practiceId) {
  await pool.query(
    `INSERT INTO patient_access_log (patient_id, staff_id, practice_id)
     VALUES ($1, $2, $3)`,
    [patientId, staffId, practiceId]
  );
}

module.exports = { findAllByPractice, findById, findHistory, create, deactivate, findLastAccess, logAccess, updateDemographics };
