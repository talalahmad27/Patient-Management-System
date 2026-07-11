'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const BADGE = {
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  no_show:   { label: 'No-show',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// Marks the outcome of a visit. Scheduled appointments (once their start time
// has passed) can be finalised by admin/receptionist; correcting a finalised
// appointment is admin-only, so those controls only render when isAdmin.
export default function AppointmentStatus({ appointmentId, status, isPast, canManage, isAdmin }) {
  const router = useRouter();
  const [loading, setLoading]     = useState(false);
  const [correcting, setCorrecting] = useState(false);

  async function patchStatus(newStatus) {
    setLoading(true);
    const res = await fetch(`/api/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    // Reset local UI state regardless of outcome. router.refresh() re-fetches
    // the server data but preserves this component's state, so without clearing
    // `correcting` the row would stay stuck showing the change buttons instead
    // of the updated badge until a full page reload.
    setLoading(false);
    setCorrecting(false);
    if (res.ok) {
      router.refresh();
    }
  }

  // Scheduled: offer the outcome buttons once the slot has passed.
  if (status === 'scheduled') {
    if (!canManage || !isPast) return null;
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => patchStatus('completed')}
          disabled={loading}
          className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-md transition-colors"
        >
          {loading ? '...' : 'Complete'}
        </button>
        <button
          onClick={() => patchStatus('no_show')}
          disabled={loading}
          className="px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 border border-amber-200 rounded-md transition-colors"
        >
          No-show
        </button>
      </div>
    );
  }

  // Finalised: show the outcome badge, with an admin-only correction toggle.
  const badge = BADGE[status] || BADGE.cancelled;

  if (correcting) {
    const alt = status === 'completed' ? 'no_show' : 'completed';
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs text-slate-500">Change to</span>
        <button
          onClick={() => patchStatus(alt)}
          disabled={loading}
          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white rounded-md transition-colors"
        >
          {loading ? '...' : BADGE[alt].label}
        </button>
        <button
          onClick={() => setCorrecting(false)}
          disabled={loading}
          className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
        >
          Keep
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className={`px-2 py-0.5 text-xs font-medium border rounded-full ${badge.className}`}>
        {badge.label}
      </span>
      {isAdmin && status !== 'cancelled' && (
        <button
          onClick={() => setCorrecting(true)}
          className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
          title="Correct this outcome (admin)"
        >
          Edit
        </button>
      )}
    </div>
  );
}
