import { Auth0Provider } from '@auth0/nextjs-auth0';
import { auth0 } from '../lib/auth0';
import Link from 'next/link';
import NavTabs from './NavTabs';
import './globals.css';

export const metadata = {
  title: 'MediCRM',
};

async function getStaffRole() {
  try {
    const session = await auth0.getSession();
    if (!session) return null;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/staff/me`, {
      headers: { Authorization: `Bearer ${session.tokenSet.accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.role || null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }) {
  const role = await getStaffRole();

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans">
        <Auth0Provider>
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg leading-none">+</span>
                </div>
                <span className="font-bold text-xl text-slate-900 tracking-tight">MediCRM</span>
              </Link>
              <NavTabs role={role} />
            </div>
          </header>
          <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </Auth0Provider>
      </body>
    </html>
  );
}
