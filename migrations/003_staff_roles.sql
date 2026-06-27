ALTER TABLE dim_staff
ADD COLUMN role TEXT NOT NULL DEFAULT 'doctor'
CHECK (role IN ('admin', 'doctor', 'nurse', 'receptionist'));

-- Existing test doctor becomes admin
UPDATE dim_staff
SET role = 'admin'
WHERE staff_id = '22222222-2222-2222-2222-222222222222';

-- Dummy doctor for testing the admin portal
INSERT INTO dim_staff (
  staff_id, practice_id, full_name, preferred_name,
  email, staff_type, specialty, role, auth_user_id, is_active
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Dr. Emily Clarke',
  'Emily',
  'emily.clarke@testclinic.com',
  'doctor',
  'General Practice',
  'doctor',
  'auth0|dummy-doctor-001',
  true
);
