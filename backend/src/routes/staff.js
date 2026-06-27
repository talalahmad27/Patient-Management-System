const express = require('express');
const router = express.Router();
const verifyJWT = require('../middleware/verifyJWT');
const staffRepository = require('../repositories/staffRepository');

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
