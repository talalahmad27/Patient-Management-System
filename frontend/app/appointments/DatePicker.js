'use client';

import { useRouter } from 'next/navigation';

export default function DatePicker({ date }) {
  const router = useRouter();

  return (
    <input
      type="date"
      value={date}
      onChange={e => router.push(`/appointments?date=${e.target.value}`)}
      className="px-3 py-1.5 text-sm font-semibold text-slate-900 bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
    />
  );
}
