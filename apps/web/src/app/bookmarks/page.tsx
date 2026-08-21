'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

interface Bookmark {
  id: string;
  document_id: string;
  document_title: string;
  document_slug: string;
  document_type: string;
  document_status: string;
  published_at: string | null;
  created_at: string;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'empty' }
  | { phase: 'ready'; bookmarks: Bookmark[] };

export default function BookmarksPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  async function load() {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    try {
      const data = await apiRequest<Bookmark[]>('/bookmarks', {
        token: session.accessToken,
        institutionId: session.institutionId,
      });
      if (data.length === 0) {
        setState({ phase: 'empty' });
      } else {
        setState({ phase: 'ready', bookmarks: data });
      }
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        router.replace('/login');
        return;
      }
      setState({ phase: 'error', message: error instanceof Error ? error.message : 'Failed to load bookmarks.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRemove(documentId: string) {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    try {
      await apiRequest(`/bookmarks/${documentId}`, {
        method: 'DELETE',
        token: session.accessToken,
        institutionId: session.institutionId,
      });
      void load();
    } catch {
      // ignore
    }
  }

  if (state.phase === 'loading') {
    return (
      <main>
        <p>Loading saved documents…</p>
      </main>
    );
  }

  if (state.phase === 'error') {
    return (
      <main>
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </main>
    );
  }

  if (state.phase === 'empty') {
    return (
      <main>
        <h1>Saved documents</h1>
        <div className="card">
          <p className="muted">Documents you save will appear here.</p>
          <p>
            <Link href="/search">Search documents</Link> · <Link href="/">Home</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Saved documents</h1>
      <p className="muted">{state.bookmarks.length} saved</p>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {state.bookmarks.map((b) => (
          <article key={b.id} className="card" style={{ margin: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
              <Link href={`/documents/${b.document_id}`}>{b.document_title}</Link>
            </h2>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {b.document_type} · {b.published_at ? new Date(b.published_at).toLocaleDateString() : 'Unpublished'} · Saved{' '}
              {new Date(b.created_at).toLocaleDateString()}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <Link href={`/documents/${b.document_id}`} className="button">
                Open
              </Link>
              <button type="button" className="secondary" onClick={() => void handleRemove(b.document_id)}>
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/search">Search</Link> · <Link href="/">Home</Link>
      </p>
    </main>
  );
}
