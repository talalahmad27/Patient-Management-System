'use client';

import { useState } from 'react';
import Link from 'next/link';

function getInitials(name) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

export default function PatientGrid({ patients }) {
  const [search, setSearch] = useState('');

  const filtered = patients.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="pb-12">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Patients</h1>
          <p className="text-slate-500 mt-1">Manage and view patient records</p>
        </div>
        <Link
          href="/patients/new"
          className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm w-fit"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Create Patient
        </Link>
      </div>

      {/* Search bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search patients by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
          />
        </div>
        <div className="text-sm text-slate-500 font-medium px-2">
          {filtered.length} {filtered.length === 1 ? 'patient' : 'patients'}
        </div>
      </div>

      {/* Patient grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-1">No patients found</h3>
          <p className="text-slate-500">
            {search ? 'Try adjusting your search term.' : 'Create a patient to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(patient => (
            <Link
              key={patient.patient_id}
              href={`/patients/${patient.patient_id}`}
              className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all cursor-pointer group flex flex-col"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-lg shrink-0 group-hover:bg-teal-100 transition-colors">
                  {getInitials(patient.full_name)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                    {patient.full_name}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {patient.age} yrs &nbsp;·&nbsp; {patient.sex || 'Sex not recorded'}
                  </p>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {patient.last_visit
                    ? `Last visit: ${new Date(patient.last_visit).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'No visits yet'}
                </div>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
