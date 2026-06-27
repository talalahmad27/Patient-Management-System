const { z } = require('zod');

const createNoteSchema = z.object({
  visit_datetime: z.string().datetime({ message: 'Must be a valid datetime' }),
  note_type:      z.enum(['consultation', 'follow_up', 'phone', 'procedure']),
  content:        z.string().min(1),
  follow_up_date: z.string().refine(val => {
    const date = new Date(val);
    return !isNaN(date) && date > new Date();
  }, { message: 'Follow up date must be in the future' }).optional(),
  measurements: z.object({
    height_cm:    z.number().min(50).max(250).optional(),
    weight_kg:    z.number().min(1).max(300).optional(),
    bp_systolic:  z.number().int().min(60).max(250).optional(),
    bp_diastolic: z.number().int().min(40).max(150).optional(),
  }).optional(),
});

module.exports = { createNoteSchema };
