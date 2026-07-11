'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PatientAppointmentForm from './PatientAppointmentForm';
import AppointmentStatus from '../../appointments/AppointmentStatus';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function AppointmentsPanel({ patientId, appointments, doctors, canManage }) {
  const router = useRouter();
  const [formMode, setFormMode]   = useState(null); // null | 'book' | 'reschedule'
  const [target, setTarget]       = useState(null); // appointment being rescheduled
  const [cancelling, setCancelling] = useState(null); // appointment_id being confirmed

  async function handleCancel(appointmentId) {
    await fetch(`/api/appointments/${appointmentId}`, { method: 'DELETE' });
    setCancelling(null);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Appointments
        </h3>
        {canManage && (
          <button
            onClick={() => setFormMode('book')}
            className="text-sm text-teal-600 hover:text-teal-800 font-medium transition-colors"
          >
            + Book
          </button>
        )}
      </div>

      {appointments.length === 0 ? (
        <p className="text-sm text-slate-400">No open appointments.</p>
      ) : (
        <div className="space-y-2">
          {appointments.map(appt => {
            const isPast = new Date(appt.scheduled_start) <= new Date();
            return (
              <div
                key={appt.appointment_id}
                className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2.5 ${
                  isPast ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatDateTime(appt.scheduled_start)}
                    {isPast && <span className="ml-2 text-xs font-medium text-amber-700">· awaiting outcome</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    with {appt.staff_name} · {appt.duration_minutes} min · <span className="capitalize">{appt.appointment_type.replace('_', ' ')}</span>
                    {appt.reason && ` · ${appt.reason}`}
                  </p>
                </div>

                {/* Past-due: mark the outcome (complete / no-show).
                    Upcoming: reschedule / cancel. */}
                {isPast ? (
                  <AppointmentStatus
                    appointmentId={appt.appointment_id}
                    status={appt.status}
                    isPast={isPast}
                    canManage={canManage}
                    isAdmin={false}
                  />
                ) : canManage && (
                  cancelling === appt.appointment_id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setCancelling(null)}
                        className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        No
                      </button>
                      <button
                        onClick={() => handleCancel(appt.appointment_id)}
                        className="px-2 py-1 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-colors"
                      >
                        Confirm
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => { setTarget(appt); setFormMode('reschedule'); }}
                        className="px-2 py-1 text-xs text-teal-700 hover:bg-teal-50 rounded-md transition-colors"
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => setCancelling(appt.appointment_id)}
                        className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {formMode && (
        <PatientAppointmentForm
          patientId={patientId}
          doctors={doctors}
          mode={formMode}
          initial={formMode === 'reschedule' ? target : undefined}
          rescheduleFromId={formMode === 'reschedule' ? target.appointment_id : undefined}
          onClose={() => { setFormMode(null); setTarget(null); }}
        />
      )}
    </div>
  );
}
