'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiRequest } from '../../lib/api';
import { getSession, clearSession } from '../../lib/auth';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/documents', label: 'Documents' },
  { href: '/admin/documents/upload', label: 'Upload' },
  { href: '/admin/documents/review-queue', label: 'Review queue' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    apiRequest<{ name: string }>('/auth/me', { token: session.accessToken })
      .then((me) => setUserName(me.name))
      .catch(() => {
        /* handled by the page-level error state */
      });
  }, [router]);

  function signOut() {
    clearSession();
    router.push('/login');
  }

  return (
    <main className="admin-main">
      <header className="admin-header">
        <div>
          <h1>Admin</h1>
          <p className="muted">Signed in as {userName || '…'}</p>
        </div>
        <button type="button" className="secondary" onClick={signOut}>
          Sign out
        </button>
      </header>

      <nav className="admin-nav" aria-label="Admin sections">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={pathname === item.href ? 'active' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}
