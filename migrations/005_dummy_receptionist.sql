-- staff_type's CHECK constraint predates the role column (migration 003) and
-- only allowed 'doctor'/'admin', which blocks creating nurse/receptionist
-- staff rows entirely. Widen it to match the values role already supports.
ALTER TABLE dim_staff DROP CONSTRAINT dim_staff_staff_type_check;
ALTER TABLE dim_staff
ADD CONSTRAINT dim_staff_staff_type_check
CHECK (staff_type IN ('doctor', 'admin', 'nurse', 'receptionist'));

-- Dummy receptionist for testing role-based access restrictions
INSERT INTO dim_staff (
  staff_id, practice_id, full_name, preferred_name,
  email, staff_type, specialty, role, auth_user_id, is_active
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'Nadia Kelly',
  'Nadia',
  'nadia.kelly@testclinic.com',
  'receptionist',
  NULL,
  'receptionist',
  'auth0|dummy-receptionist-001',
  true
);
