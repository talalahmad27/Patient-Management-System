const staffRepository = require('../repositories/staffRepository');

async function attachStaff(req, res, next) {
  try {
    const authUserId = req.auth.payload.sub;
    const staff = await staffRepository.findByAuthUserId(authUserId);

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    req.user = staff;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = attachStaff;
