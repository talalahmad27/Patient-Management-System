'use client';

import { useState } from 'react';

export default function VisitHistoryItem({ version, isFirst }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-white border-2 shadow-sm ${isFirst ? 'border-teal-500' : 'border-slate-300'}`} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between gap-3 p-5 text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-md w-fit">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(version.effective_from).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            {version.is_current && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold w-fit">
                Latest Patient Visit
              </span>
            )}
            {version.notes.length > 0 && (
              <span className="text-xs text-slate-400">
                {version.notes.length} note{version.notes.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <svg
            className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="px-5 pb-5 pt-4 border-t border-slate-100">
            {/* Measurements row */}
            <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-4">
              <span>Weight: <strong className="text-slate-800">{version.weight_kg ?? '—'} kg</strong></span>
              <span>BP: <strong className="text-slate-800">{version.bp_systolic ? `${version.bp_systolic}/${version.bp_diastolic}` : '—'}</strong></span>
              <span>Height: <strong className="text-slate-800">{version.height_cm ?? '—'} cm</strong></span>
            </div>

            {/* Notes */}
            {version.notes && version.notes.length > 0 && (
              <div className="space-y-3">
                {version.notes.map(note => (
                  <div key={note.note_id} className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 flex gap-3 items-start">
                    <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                        <span className="font-semibold text-slate-700 capitalize">{note.note_type}</span>
                        <span className="text-slate-300">·</span>
                        <span>{note.written_by}</span>
                        <span className="text-slate-300">·</span>
                        <span>{new Date(note.visit_datetime).toLocaleDateString('en-AU')}</span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{note.content}</p>
                      {note.follow_up_date && (
                        <p className="mt-2 text-xs text-emerald-600 font-medium">
                          Follow-up: {note.follow_up_date}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
