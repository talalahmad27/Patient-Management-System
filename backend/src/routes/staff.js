const express = require('express');
const router = express.Router();
const verifyJWT = require('../middleware/verifyJWT');
const attachStaff = require('../middleware/attachStaff');
const staffRepository = require('../repositories/staffRepository');

// GET /api/staff — list active staff in the caller's practice (e.g. for a doctor picker)
router.get('/', verifyJWT, attachStaff, async (req, res, next) => {
  try {
    const staff = await staffRepository.findAllByPractice(req.user.practice_id);
    res.json({ data: staff });
  } catch (err) {
    next(err);
  }
});

router.get('/me', verifyJWT, async (req, res, next) => {
  try {
    const authUserId = req.auth.payload.sub;
    const staff = await staffRepository.findByAuthUserId(authUserId);

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    req.user = staff;
    res.json({ data: staff });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
