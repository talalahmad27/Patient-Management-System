'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BookAppointmentForm({ date, patients, doctors }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const form = new FormData(e.target);
    const time = form.get('time');
    const reason = form.get('reason');

    const body = {
      patient_id:       form.get('patient_id'),
      staff_id:         form.get('staff_id'),
      scheduled_start:  new Date(`${date}T${time}:00`).toISOString(),
      duration_minutes: parseInt(form.get('duration_minutes')),
      appointment_type: form.get('appointment_type'),
      reason: reason || undefined,
    };

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setOpen(false);
      setLoading(false);
      router.refresh();
    } else {
      const json = await res.json();
      const msg = Array.isArray(json.error)
        ? json.error.map(e => e.message).join(', ')
        : (json.error || 'Failed to book appointment.');
      setStatus(msg);
      setLoading(false);
    }
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
        Book Appointment
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-40 p-4" onClick={() => setOpen(false)}>
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Book Appointment</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
            <select
              name="patient_id"
              required
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            >
              <option value="">— select patient —</option>
              {patients.map(p => (
                <option key={p.patient_id} value={p.patient_id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Doctor / Provider</label>
            <select
              name="staff_id"
              required
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            >
              <option value="">— select provider —</option>
              {doctors.map(d => (
                <option key={d.staff_id} value={d.staff_id}>{d.full_name} ({d.role})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time"
                name="time"
                required
                defaultValue="09:00"
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
                defaultValue="30"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select
              name="appointment_type"
              defaultValue="consultation"
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
              placeholder="e.g. BP recheck"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-medium rounded-lg transition-colors shadow-sm"
            >
              {loading ? 'Booking...' : 'Book Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
