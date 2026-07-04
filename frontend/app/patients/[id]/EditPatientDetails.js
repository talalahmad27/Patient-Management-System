'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EditPatientDetails({ patient }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const form = new FormData(e.target);
    const body = {
      full_name:  form.get('full_name'),
      birth_year: parseInt(form.get('birth_year')),
    };

    const sex   = form.get('sex');
    const phone = form.get('phone');
    const email = form.get('email');
    if (sex)   body.sex   = sex;
    if (phone) body.phone = phone;
    if (email) body.email = email;

    const res = await fetch(`/api/patients/${patient.patient_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setEditing(false);
      setLoading(false);
      router.refresh();
    } else {
      const json = await res.json();
      const msg = Array.isArray(json.error)
        ? json.error.map(e => e.message).join(', ')
        : 'Failed to update patient details.';
      setStatus(msg);
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Edit Details
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 w-full sm:w-96">
      {status && (
        <div className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
          {status}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
        <input
          name="full_name"
          required
          defaultValue={patient.full_name}
          className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Year of Birth</label>
          <input
            type="number"
            name="birth_year"
            required
            min="1900"
            max={new Date().getFullYear()}
            defaultValue={patient.birth_year}
            className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Sex</label>
          <select
            name="sex"
            defaultValue={patient.sex || ''}
            className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          >
            <option value="">— select —</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
          <input
            name="phone"
            defaultValue={patient.phone || ''}
            className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            defaultValue={patient.email || ''}
            className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={loading}
          className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
