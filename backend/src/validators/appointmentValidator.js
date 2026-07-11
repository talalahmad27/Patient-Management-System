const { z } = require('zod');

const createAppointmentSchema = z.object({
  patient_id:        z.string().uuid(),
  staff_id:          z.string().uuid(),
  scheduled_start:   z.string().datetime({ message: 'Must be a valid datetime' }),
  duration_minutes:  z.number().int().min(5).max(240).optional(),
  appointment_type:  z.enum(['consultation', 'follow_up', 'phone', 'procedure']).optional(),
  reason:            z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'no_show', 'cancelled']),
});

module.exports = { createAppointmentSchema, updateStatusSchema };
