const express = require('express');
const router = express.Router();
const verifyJWT = require('../middleware/verifyJWT');
const attachStaff = require('../middleware/attachStaff');
const requireAdmin = require('../middleware/requireAdmin');
const staffRepository = require('../repositories/staffRepository');

router.get('/staff', verifyJWT, attachStaff, requireAdmin, async (req, res, next) => {
  try {
    const staff = await staffRepository.findAllByPractice(req.user.practice_id);
    res.json({ data: staff });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
