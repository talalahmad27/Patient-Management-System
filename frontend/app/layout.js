import { Auth0Provider } from '@auth0/nextjs-auth0';
import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'MediCRM',
};

export default function RootLayout({ children }) {
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
              <a href="/auth/logout" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">
                Logout
              </a>
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
