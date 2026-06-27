'use client';

const ROLE_STYLES = {
  admin:         'bg-purple-50 text-purple-700 border border-purple-200',
  doctor:        'bg-teal-50 text-teal-700 border border-teal-200',
  nurse:         'bg-blue-50 text-blue-700 border border-blue-200',
  receptionist:  'bg-amber-50 text-amber-700 border border-amber-200',
};

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

export default function StaffList({ staff }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="text-left px-6 py-3 font-semibold text-slate-600">Name</th>
            <th className="text-left px-6 py-3 font-semibold text-slate-600">Role</th>
            <th className="text-left px-6 py-3 font-semibold text-slate-600">Specialty</th>
            <th className="text-left px-6 py-3 font-semibold text-slate-600">Email</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member, i) => (
            <tr
              key={member.staff_id}
              className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {getInitials(member.full_name)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{member.full_name}</p>
                    {member.preferred_name && (
                      <p className="text-xs text-slate-400">Prefers: {member.preferred_name}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${ROLE_STYLES[member.role] || 'bg-slate-100 text-slate-600'}`}>
                  {member.role}
                </span>
              </td>
              <td className="px-6 py-4 text-slate-600">{member.specialty || '—'}</td>
              <td className="px-6 py-4 text-slate-600">{member.email || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
