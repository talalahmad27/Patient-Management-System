'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NoteForm({ patientId }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const form = new FormData(e.target);
    const measurements = {};

    const weightKg    = form.get('weight_kg');
    const heightCm    = form.get('height_cm');
    const bpSystolic  = form.get('bp_systolic');
    const bpDiastolic = form.get('bp_diastolic');

    if (weightKg)    measurements.weight_kg    = parseFloat(weightKg);
    if (heightCm)    measurements.height_cm    = parseFloat(heightCm);
    if (bpSystolic)  measurements.bp_systolic  = parseInt(bpSystolic);
    if (bpDiastolic) measurements.bp_diastolic = parseInt(bpDiastolic);

    const body = {
      visit_datetime: new Date().toISOString(),
      note_type:      form.get('note_type'),
      content:        form.get('content'),
      follow_up_date: form.get('follow_up_date') || undefined,
      measurements:   Object.keys(measurements).length > 0 ? measurements : undefined,
    };

    const res = await fetch(`/api/patients/${patientId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      e.target.reset();
      setOpen(false);
      setStatus(null);
      router.refresh();
    } else {
      setStatus('Failed to save note. Please check all fields.');
    }

    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Visit Note
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">New Visit Note</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); setStatus(null); }}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6">
        {status && (
          <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
            {status}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type + follow-up */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Note Type</label>
              <select
                name="note_type"
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
              >
                <option value="consultation">Consultation</option>
                <option value="follow_up">Follow Up</option>
                <option value="phone">Phone</option>
                <option value="procedure">Procedure</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Follow-up Date</label>
              <input
                type="date"
                name="follow_up_date"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Clinical Notes</label>
            <textarea
              name="content"
              required
              rows={4}
              placeholder="Enter clinical notes..."
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all resize-vertical"
            />
          </div>

          {/* Measurements */}
          <div>
            <p className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">
              Measurements (leave blank if unchanged)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { name: 'weight_kg',    label: 'Weight (kg)', step: '0.1' },
                { name: 'height_cm',    label: 'Height (cm)', step: '0.1' },
                { name: 'bp_systolic',  label: 'BP Systolic',  step: '1' },
                { name: 'bp_diastolic', label: 'BP Diastolic', step: '1' },
              ].map(({ name, label, step }) => (
                <div key={name}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                  <input
                    type="number"
                    name={name}
                    step={step}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { setOpen(false); setStatus(null); }}
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-medium rounded-lg transition-colors shadow-sm"
            >
              {loading ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
