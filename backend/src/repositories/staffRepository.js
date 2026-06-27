const pool = require('../db');

async function findByAuthUserId(authUserId) {
  const { rows } = await pool.query(
    `SELECT staff_id, practice_id, full_name, preferred_name, email,
            staff_type, specialty, is_active
     FROM dim_staff
     WHERE auth_user_id = $1 AND is_active = true`,
    [authUserId]
  );
  return rows[0] || null;
}

module.exports = { findByAuthUserId };
