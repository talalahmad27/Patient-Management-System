const express = require('express');
const router = express.Router();
const verifyJWT = require('../middleware/verifyJWT');
const attachStaff = require('../middleware/attachStaff');
const checkRole = require('../middleware/checkRole');
const appointmentRepository = require('../repositories/appointmentRepository');
const { createAppointmentSchema, updateStatusSchema } = require('../validators/appointmentValidator');

// GET /api/appointments?date=YYYY-MM-DD or ?patient_id=uuid (upcoming only)
router.get('/', verifyJWT, attachStaff, async (req, res, next) => {
  try {
    if (req.query.patient_id) {
      const appointments = await appointmentRepository.findOpenByPatient(req.query.patient_id, req.user.practice_id);
      return res.json({ data: appointments });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const appointments = await appointmentRepository.findByDay(req.user.practice_id, date);
    res.json({ data: appointments });
  } catch (err) {
    next(err);
  }
});

// POST /api/appointments
router.post('/', verifyJWT, attachStaff, checkRole('admin', 'receptionist'), async (req, res, next) => {
  try {
    const result = createAppointmentSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors });
    }

    const outcome = await appointmentRepository.create(
      req.user.practice_id,
      req.user.staff_id,
      result.data
    );

    if (outcome.error === 'clash') {
      return res.status(409).json({
        error: `This provider already has an appointment with ${outcome.clash.patient_name} at that time`,
      });
    }
    if (outcome.error === 'not_found') {
      return res.status(404).json({ error: 'Patient or staff member not found in this practice' });
    }

    res.status(201).json({ data: outcome.appointment });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/appointments/:appointmentId/status
// Mark the outcome of a visit. Admin + receptionist may finalise a scheduled
// appointment (completed / no_show); correcting an already-finalised one is
// admin-only.
router.patch('/:appointmentId/status', verifyJWT, attachStaff, checkRole('admin', 'receptionist'), async (req, res, next) => {
  try {
    const result = updateStatusSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors });
    }
    const { status } = result.data;

    const appt = await appointmentRepository.findById(req.params.appointmentId, req.user.practice_id);
    if (!appt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // A scheduled appointment can only move to completed or no_show here —
    // cancellation goes through DELETE.
    if (appt.status === 'scheduled') {
      if (status !== 'completed' && status !== 'no_show') {
        return res.status(400).json({ error: 'A scheduled appointment can only be marked completed or no_show' });
      }
      const updated = await appointmentRepository.markOutcome(req.params.appointmentId, req.user.practice_id, status);
      if (!updated) {
        return res.status(400).json({ error: 'An appointment cannot be finalised before its start time' });
      }
      return res.json({ data: updated });
    }

    // Appointment is already finalised (completed / no_show / cancelled) —
    // changing it is a correction, admin only.
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only an admin can change an appointment that is already finalised' });
    }
    const corrected = await appointmentRepository.correctStatus(req.params.appointmentId, req.user.practice_id, status);
    if (!corrected) {
      return res.status(400).json({ error: 'A future appointment cannot be marked completed' });
    }
    res.json({ data: corrected });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/appointments/:appointmentId (soft cancel, not a hard delete)
router.delete('/:appointmentId', verifyJWT, attachStaff, checkRole('admin', 'receptionist'), async (req, res, next) => {
  try {
    const cancelled = await appointmentRepository.cancel(req.params.appointmentId, req.user.practice_id);

    if (!cancelled) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ data: cancelled });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
