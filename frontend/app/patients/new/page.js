import { auth0 } from '../../../lib/auth0';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import NewPatientForm from './NewPatientForm';

export default async function NewPatientPage() {
  try {
    const session = await auth0.getSession();
    if (!session) redirect('/auth/login');
  } catch {
    redirect('/auth/login');
  }

  return (
    <div className="max-w-2xl mx-auto pb-12">
      {/* Back */}
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

      {/* Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900">Create New Patient</h1>
          <p className="text-sm text-slate-500 mt-1">Fill in the patient details below</p>
        </div>
        <div className="p-6">
          <NewPatientForm />
        </div>
      </div>
    </div>
  );
}
