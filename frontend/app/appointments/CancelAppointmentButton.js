'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CancelAppointmentButton({ appointmentId }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);

  async function handleCancel() {
    setLoading(true);
    const res = await fetch(`/api/appointments/${appointmentId}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    } else {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
        >
          No
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="px-2 py-1 text-xs bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-md transition-colors"
        >
          {loading ? '...' : 'Confirm'}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="shrink-0 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
    >
      Cancel
    </button>
  );
}
