'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewPatientForm() {
  const router = useRouter();
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(false);

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

    const height_cm    = form.get('height_cm');
    const weight_kg    = form.get('weight_kg');
    const bp_systolic  = form.get('bp_systolic');
    const bp_diastolic = form.get('bp_diastolic');
    if (height_cm)    body.height_cm    = parseFloat(height_cm);
    if (weight_kg)    body.weight_kg    = parseFloat(weight_kg);
    if (bp_systolic)  body.bp_systolic  = parseInt(bp_systolic);
    if (bp_diastolic) body.bp_diastolic = parseInt(bp_diastolic);

    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (res.ok) {
      router.push(`/patients/${json.data.patient_id}`);
    } else {
      const msg = Array.isArray(json.error)
        ? json.error.map(e => e.message).join(', ')
        : 'Failed to create patient.';
      setStatus(msg);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {status && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
          {status}
        </div>
      )}

      {/* Personal information */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
          Personal Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
            <input
              name="full_name"
              required
              placeholder="e.g. Jane Smith"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Year of Birth *</label>
            <input
              type="number"
              name="birth_year"
              required
              min="1900"
              max={new Date().getFullYear()}
              placeholder="e.g. 1985"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sex</label>
            <select
              name="sex"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            >
              <option value="">— select —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input
              name="phone"
              placeholder="04xx xxx xxx"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              placeholder="patient@example.com"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Initial vitals */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
          Initial Vitals (Optional)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg)</label>
            <input
              type="number"
              name="weight_kg"
              step="0.1"
              placeholder="70"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Height (cm)</label>
            <input
              type="number"
              name="height_cm"
              step="0.1"
              placeholder="170"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">BP Systolic</label>
            <input
              type="number"
              name="bp_systolic"
              placeholder="120"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">BP Diastolic</label>
            <input
              type="number"
              name="bp_diastolic"
              placeholder="80"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          {loading ? 'Saving...' : 'Save Patient'}
        </button>
      </div>
    </form>
  );
}
