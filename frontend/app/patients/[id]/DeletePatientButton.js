'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeletePatientButton({ patientId, patientName }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/patients/${patientId}`, { method: 'DELETE' });

    if (res.ok || res.status === 204) {
      router.push('/');
      router.refresh();
    } else {
      setError('Failed to delete. Please try again.');
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <p className="text-sm text-slate-600">
          Delete <strong>{patientName}</strong>?
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-lg transition-colors"
          >
            {loading ? 'Deleting...' : 'Yes, delete'}
          </button>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
      Delete Patient
    </button>
  );
}
