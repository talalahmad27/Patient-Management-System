'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PatientAppointmentForm({ patientId, doctors, mode, initial, rescheduleFromId, onClose }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const form = new FormData(e.target);
    const body = {
      patient_id:       patientId,
      staff_id:         form.get('staff_id'),
      scheduled_start:  new Date(form.get('datetime')).toISOString(),
      duration_minutes: parseInt(form.get('duration_minutes')),
      appointment_type: form.get('appointment_type'),
      reason:           form.get('reason') || undefined,
    };

    const createRes = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!createRes.ok) {
      const json = await createRes.json();
      const msg = Array.isArray(json.error)
        ? json.error.map(e => e.message).join(', ')
        : (json.error || 'Failed to save appointment.');
      setStatus(msg);
      setLoading(false);
      return;
    }

    // Reschedule = create the new slot, then cancel the old one — keeps the
    // original appointment in the record instead of silently overwriting it.
    if (rescheduleFromId) {
      await fetch(`/api/appointments/${rescheduleFromId}`, { method: 'DELETE' });
    }

    setLoading(false);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">
            {mode === 'reschedule' ? 'Reschedule Appointment' : 'Book Appointment'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {status && (
          <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
            {status}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Doctor / Provider</label>
            <select
              name="staff_id"
              required
              defaultValue={initial?.staff_id || ''}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            >
              <option value="">— select provider —</option>
              {doctors.map(d => (
                <option key={d.staff_id} value={d.staff_id}>{d.full_name} ({d.role})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date & Time</label>
            <input
              type="datetime-local"
              name="datetime"
              required
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Duration (min)</label>
            <input
              type="number"
              name="duration_minutes"
              required
              min="5"
              max="240"
              step="5"
              defaultValue={initial?.duration_minutes || 30}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select
              name="appointment_type"
              defaultValue={initial?.appointment_type || 'consultation'}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            >
              <option value="consultation">Consultation</option>
              <option value="follow_up">Follow Up</option>
              <option value="phone">Phone</option>
              <option value="procedure">Procedure</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
            <input
              name="reason"
              defaultValue={initial?.reason || ''}
              placeholder="e.g. BP recheck"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-medium rounded-lg transition-colors shadow-sm"
            >
              {loading ? 'Saving...' : mode === 'reschedule' ? 'Save New Time' : 'Book Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
