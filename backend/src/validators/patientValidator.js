const { z } = require('zod');

const currentYear = new Date().getFullYear();

const createPatientSchema = z.object({
  full_name:    z.string().min(2),
  birth_year:   z.number().int().min(1900).max(currentYear),
  sex:          z.enum(['male', 'female', 'other']).optional(),
  phone:        z.string().optional(),
  email:        z.string().email().optional(),
  height_cm:    z.number().min(50).max(250).optional(),
  weight_kg:    z.number().min(1).max(300).optional(),
  bp_systolic:  z.number().int().min(60).max(250).optional(),
  bp_diastolic: z.number().int().min(40).max(150).optional(),
}).transform(data => ({
  ...data,
  date_of_birth: `${data.birth_year}-01-01`,
}));

const updatePatientSchema = z.object({
  full_name:  z.string().min(2).optional(),
  birth_year: z.number().int().min(1900).max(currentYear).optional(),
  sex:        z.enum(['male', 'female', 'other']).optional(),
  phone:      z.string().optional(),
  email:      z.string().email().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field is required',
}).transform(({ birth_year, ...rest }) => ({
  ...rest,
  ...(birth_year ? { date_of_birth: `${birth_year}-01-01` } : {}),
}));

module.exports = { createPatientSchema, updatePatientSchema };
