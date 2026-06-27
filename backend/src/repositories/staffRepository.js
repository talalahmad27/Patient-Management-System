const pool = require('../db');

async function findByAuthUserId(authUserId) {
  const { rows } = await pool.query(
    `SELECT staff_id, practice_id, full_name, preferred_name, email,
            staff_type, specialty, role, is_active
     FROM dim_staff
     WHERE auth_user_id = $1 AND is_active = true`,
    [authUserId]
  );
  return rows[0] || null;
}

async function findAllByPractice(practiceId) {
  const { rows } = await pool.query(
    `SELECT staff_id, full_name, preferred_name, email,
            staff_type, specialty, role, is_active
     FROM dim_staff
     WHERE practice_id = $1 AND is_active = true
     ORDER BY role, full_name`,
    [practiceId]
  );
  return rows;
}

module.exports = { findByAuthUserId, findAllByPractice };
