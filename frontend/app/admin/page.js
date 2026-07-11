import { auth0 } from '../../lib/auth0';
import { redirect } from 'next/navigation';
import StaffList from './StaffList';

async function getStaff(accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/staff`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

export default async function AdminPage() {
  let accessToken;
  try {
    const session = await auth0.getSession();
    if (!session) redirect('/auth/login');
    accessToken = session.tokenSet.accessToken;
  } catch {
    redirect('/auth/login');
  }

  const staff = await getStaff(accessToken);

  // If backend returned 403 (non-admin), redirect home
  if (!staff) redirect('/');

  const adminCount  = staff.filter(s => s.role === 'admin').length;
  const doctorCount = staff.filter(s => s.role === 'doctor').length;
  const nurseCount  = staff.filter(s => s.role === 'nurse').length;
  const recepCount  = staff.filter(s => s.role === 'receptionist').length;

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Admin Portal</h1>
        <p className="text-slate-500 mt-1">Manage your clinic staff and settings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Admins',         count: adminCount,  color: 'bg-purple-50 text-purple-700 border-purple-200' },
          { label: 'Doctors',        count: doctorCount, color: 'bg-teal-50 text-teal-700 border-teal-200' },
          { label: 'Nurses',         count: nurseCount,  color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Receptionists',  count: recepCount,  color: 'bg-amber-50 text-amber-700 border-amber-200' },
        ].map(({ label, count, color }) => (
          <div key={label} className={`rounded-xl border p-4 ${color}`}>
            <p className="text-3xl font-bold">{count}</p>
            <p className="text-sm font-medium mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Staff list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          All Staff <span className="text-slate-400 font-normal text-base ml-1">({staff.length})</span>
        </h2>
      </div>

      {staff.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
          <p className="text-slate-500">No staff members found.</p>
        </div>
      ) : (
        <StaffList staff={staff} />
      )}
    </div>
  );
}
