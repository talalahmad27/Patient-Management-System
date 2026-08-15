-- Seed the default practice and initial admin staff member.
-- Required before migration 003+ which reference this practice_id.

INSERT INTO dim_practice (
  practice_id, practice_name, phone, email,
  address_line1, suburb, state, postcode, country
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Test Clinic',
  '0400000000',
  'admin@testclinic.com',
  '123 Health St',
  'Sydney',
  'NSW',
  '2000',
  'AU'
) ON CONFLICT (practice_id) DO NOTHING;

-- Initial admin/doctor staff member (the one 003 tries to UPDATE to admin)
INSERT INTO dim_staff (
  staff_id, practice_id, full_name, preferred_name,
  email, staff_type, auth_user_id, is_active
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Dr. Talal Ahmad',
  'Talal',
  'talalahmad76@gmail.com',
  'doctor',
  'auth0|placeholder-replace-after-first-login',
  true
) ON CONFLICT (staff_id) DO NOTHING;
