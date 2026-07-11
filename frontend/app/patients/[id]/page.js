import { auth0 } from '../../../lib/auth0';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NoteForm from './NoteForm';
import DeletePatientButton from './DeletePatientButton';
import VisitHistoryItem from './VisitHistoryItem';
import EditPatientDetails from './EditPatientDetails';
import AppointmentsPanel from './AppointmentsPanel';

async function getPatient(id, accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

async function getHistory(id, accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${id}/history`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

async function getRole(accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/staff/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.role || null;
}

async function getAppointments(patientId, accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/appointments?patient_id=${patientId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

async function getStaff(accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/staff`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatSex(sex) {
  if (!sex) return 'Not recorded';
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

function formatRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export default async function PatientDetailPage({ params }) {
  let accessToken;
  try {
    const session = await auth0.getSession();
    if (!session) redirect('/auth/login');
    accessToken = session.tokenSet.accessToken;
  } catch {
    redirect('/auth/login');
  }

  const { id } = await params;
  const [patient, history, role, appointments, staff] = await Promise.all([
    getPatient(id, accessToken),
    getHistory(id, accessToken),
    getRole(accessToken),
    getAppointments(id, accessToken),
    getStaff(accessToken),
  ]);

  const canViewClinicalData = role !== 'receptionist';
  const canManageAppointments = role === 'admin' || role === 'receptionist';
  const doctors = staff.filter(s => s.role !== 'receptionist');

  if (!patient) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg font-medium text-slate-900 mb-2">Patient not found</p>
        <Link href="/" className="text-teal-600 hover:underline text-sm">Back to patients</Link>
      </div>
    );
  }

  const vitals = [
    { label: 'Weight', value: patient.weight_kg ? `${patient.weight_kg}` : '—', unit: 'kg' },
    { label: 'Height', value: patient.height_cm ? `${patient.height_cm}` : '—', unit: 'cm' },
    { label: 'Blood Pressure', value: patient.bp_systolic ? `${patient.bp_systolic}/${patient.bp_diastolic}` : '—', unit: 'mmHg' },
  ];

  return (
    <div className="pb-12">
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium text-sm px-3 py-2 -ml-3 rounded-lg hover:bg-slate-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Patients
        </Link>
      </div>

      {/* Patient profile card */}
      <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200 shadow-sm mb-8">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="w-20 h-20 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-2xl font-bold shrink-0">
            {getInitials(patient.full_name)}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
              {patient.full_name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span><span className="text-slate-400">Age:</span> {patient.age}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span><span className="text-slate-400">Sex:</span> {formatSex(patient.sex)}</span>
              </span>
              {patient.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span><span className="text-slate-400">Phone:</span> {patient.phone}</span>
                </span>
              )}
              {patient.email && (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="truncate"><span className="text-slate-400">Email:</span> {patient.email}</span>
                </span>
              )}
            </div>
            {patient.last_accessed_by && (
              <p className="mt-2 text-xs text-slate-400">
                Last checked by <span className="font-medium text-slate-500">{patient.last_accessed_by.full_name}</span>
                {' '}· {formatRelativeTime(patient.last_accessed_by.accessed_at)}
              </p>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <EditPatientDetails patient={patient} />
            {canViewClinicalData && (
              <DeletePatientButton patientId={patient.patient_id} patientName={patient.full_name} />
            )}
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: vitals */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Current Vitals
          </h3>

          {vitals.map(({ label, value, unit }) => (
            <div key={label} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500 mb-2">{label}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-slate-800">{value}</span>
                {value !== '—' && <span className="text-sm font-medium text-slate-500">{unit}</span>}
              </div>
            </div>
          ))}

          <AppointmentsPanel
            patientId={patient.patient_id}
            appointments={appointments}
            doctors={doctors}
            canManage={canManageAppointments}
          />
        </div>

        {/* Right column: add note + visit history */}
        <div className="lg:col-span-2 space-y-6">
          {canViewClinicalData && <NoteForm patientId={id} />}

          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Visit History
            </h3>

            {!canViewClinicalData ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
                Clinical visit history is visible to clinical staff only.
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
                No visits recorded yet.
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200 shadow-sm">
                <div className="relative border-l-2 border-slate-200 ml-4 space-y-4 pb-2">
                  {history.map((version, i) => (
                    <VisitHistoryItem key={version.patient_dim_id} version={version} isFirst={i === 0} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
