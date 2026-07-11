'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavTabs({ role }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: 'Patients', active: pathname === '/' || pathname.startsWith('/patients') },
    { href: '/appointments', label: 'Appointments', active: pathname.startsWith('/appointments') },
  ];
  if (role === 'admin') {
    tabs.push({ href: '/admin', label: 'Admin Portal', active: pathname.startsWith('/admin') });
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {tabs.map(({ href, label, active }) => (
        <Link
          key={href}
          href={href}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
            active
              ? 'bg-teal-50 text-teal-700'
              : 'text-slate-600 hover:text-teal-700 hover:bg-slate-100'
          }`}
        >
          {label}
        </Link>
      ))}
      <a
        href="/auth/logout"
        className="text-sm text-slate-500 hover:text-slate-800 transition-colors ml-2 sm:ml-3 px-3 py-1.5"
      >
        Logout
      </a>
    </div>
  );
}
