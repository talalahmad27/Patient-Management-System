const express = require('express');
const router = express.Router();
const { OpenFgaClient } = require('@openfga/sdk');
const verifyJWT = require('../middleware/verifyJWT');
const attachStaff = require('../middleware/attachStaff');
const checkFGA = require('../middleware/checkFGA');
const patientRepository = require('../repositories/patientRepository');
const { createPatientSchema } = require('../validators/patientValidator');

const fgaClient = new OpenFgaClient({
  apiUrl: process.env.FGA_API_URL,
  storeId: process.env.FGA_STORE_ID,
});

// GET /api/patients
router.get('/', verifyJWT, attachStaff, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.search || '';

    const { patients, total } = await patientRepository.findAllByPractice(
      req.user.practice_id,
      { search, page, limit }
    );

    res.json({
      data: patients,
      pagination: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:patientId
router.get('/:patientId', verifyJWT, attachStaff, checkFGA('can_read'), async (req, res, next) => {
  try {
    const patient = await patientRepository.findById(req.params.patientId);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({ data: patient });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:patientId/history
router.get('/:patientId/history', verifyJWT, attachStaff, checkFGA('can_read'), async (req, res, next) => {
  try {
    const history = await patientRepository.findHistory(req.params.patientId);
    res.json({ data: history });
  } catch (err) {
    next(err);
  }
});

// POST /api/patients
router.post('/', verifyJWT, attachStaff, async (req, res, next) => {
  try {
    const result = createPatientSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors });
    }

    const patient = await patientRepository.create(
      req.user.practice_id,
      req.user.staff_id,
      result.data
    );

    await fgaClient.write({
      writes: [
        {
          user:     `practice:${req.user.practice_id}`,
          relation: 'practice',
          object:   `patient:${patient.patient_id}`,
        },
      ],
    });

    res.status(201).json({ data: patient });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/patients/:patientId
router.delete('/:patientId', verifyJWT, attachStaff, checkFGA('can_write'), async (req, res, next) => {
  try {
    const deleted = await patientRepository.deactivate(
      req.params.patientId,
      req.user.practice_id
    );
    if (!deleted) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
