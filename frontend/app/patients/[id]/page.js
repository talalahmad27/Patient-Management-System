import { auth0 } from '../../../lib/auth0';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NoteForm from './NoteForm';
import DeletePatientButton from './DeletePatientButton';

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

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
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
  const [patient, history] = await Promise.all([
    getPatient(id, accessToken),
    getHistory(id, accessToken),
  ]);

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
              <span>Born {patient.birth_year} &nbsp;·&nbsp; Age {patient.age}</span>
              <span>{patient.sex || 'Sex not recorded'}</span>
              {patient.phone && <span>{patient.phone}</span>}
              {patient.email && <span className="truncate">{patient.email}</span>}
            </div>
          </div>

          <div className="shrink-0">
            <DeletePatientButton patientId={patient.patient_id} patientName={patient.full_name} />
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
        </div>

        {/* Right column: add note + visit history */}
        <div className="lg:col-span-2 space-y-6">
          <NoteForm patientId={id} />

          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Visit History
            </h3>

            {history.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
                No visits recorded yet.
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200 shadow-sm">
                <div className="relative border-l-2 border-slate-200 ml-4 space-y-8 pb-2">
                  {history.map((version, i) => (
                    <div key={version.patient_dim_id} className="relative pl-8">
                      {/* Timeline dot */}
                      <div className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-white border-2 shadow-sm ${i === 0 ? 'border-teal-500' : 'border-slate-300'}`} />

                      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        {/* Header row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-md w-fit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(version.effective_from).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                          {version.is_current && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold w-fit">
                              Current
                            </span>
                          )}
                        </div>

                        {/* Measurements row */}
                        <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-4">
                          <span>Weight: <strong className="text-slate-800">{version.weight_kg ?? '—'} kg</strong></span>
                          <span>BP: <strong className="text-slate-800">{version.bp_systolic ? `${version.bp_systolic}/${version.bp_diastolic}` : '—'}</strong></span>
                          <span>Height: <strong className="text-slate-800">{version.height_cm ?? '—'} cm</strong></span>
                        </div>

                        {/* Notes */}
                        {version.notes && version.notes.length > 0 && (
                          <div className="space-y-3">
                            {version.notes.map(note => (
                              <div key={note.note_id} className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 flex gap-3 items-start">
                                <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                                    <span className="font-semibold text-slate-700 capitalize">{note.note_type}</span>
                                    <span className="text-slate-300">·</span>
                                    <span>{note.written_by}</span>
                                    <span className="text-slate-300">·</span>
                                    <span>{new Date(note.visit_datetime).toLocaleDateString('en-AU')}</span>
                                  </div>
                                  <p className="text-sm text-slate-700 leading-relaxed">{note.content}</p>
                                  {note.follow_up_date && (
                                    <p className="mt-2 text-xs text-emerald-600 font-medium">
                                      Follow-up: {note.follow_up_date}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
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
