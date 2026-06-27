const { OpenFgaClient } = require('@openfga/sdk');

const fgaClient = new OpenFgaClient({
  apiUrl: process.env.FGA_API_URL,
  storeId: process.env.FGA_STORE_ID,
});

function checkFGA(relation) {
  return async (req, res, next) => {
    if (req.user.role === 'admin') return next();

    try {
      const staffId = req.user.staff_id;
      const patientId = req.params.patientId;

      const { allowed } = await fgaClient.check({
        user: `staff:${staffId}`,
        relation,
        object: `patient:${patientId}`,
      });

      if (!allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = checkFGA;
