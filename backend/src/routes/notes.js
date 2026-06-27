const express = require('express');
const router = express.Router({ mergeParams: true });
const verifyJWT = require('../middleware/verifyJWT');
const attachStaff = require('../middleware/attachStaff');
const checkFGA = require('../middleware/checkFGA');
const noteRepository = require('../repositories/noteRepository');
const { createNoteSchema } = require('../validators/noteValidator');

// GET /api/patients/:patientId/notes
router.get('/', verifyJWT, attachStaff, checkFGA('can_read'), async (req, res, next) => {
  try {
    const notes = await noteRepository.findAllByPatient(req.params.patientId);
    res.json({ data: notes });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:patientId/notes/:noteId
router.get('/:noteId', verifyJWT, attachStaff, checkFGA('can_read'), async (req, res, next) => {
  try {
    const note = await noteRepository.findById(req.params.noteId);

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({ data: note });
  } catch (err) {
    next(err);
  }
});

// POST /api/patients/:patientId/notes
router.post('/', verifyJWT, attachStaff, checkFGA('can_write'), async (req, res, next) => {
  try {
    const result = createNoteSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors });
    }

    const note = await noteRepository.create(
      req.params.patientId,
      req.user.staff_id,
      req.user.practice_id,
      result.data
    );

    res.status(201).json({ data: note });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
