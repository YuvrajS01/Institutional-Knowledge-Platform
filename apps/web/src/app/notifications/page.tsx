'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'empty' }
  | { phase: 'ready'; notifications: Notification[]; unread: number };

export default function NotificationsPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  async function load() {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    try {
      const res = await apiRequest<Notification[]>('/notifications', {
        token: session.accessToken,
        institutionId: session.institutionId,
      });
      // The API returns { data: Notification[], meta: { unread_count } } but apiRequest unwraps data
      // For this page, we need to use apiEnvelopeRequest to get meta, but for MVP we just use data
      const data = Array.isArray(res) ? res : [];
      if (data.length === 0) {
        setState({ phase: 'empty' });
      } else {
        // Count unread client-side
        const unread = data.filter((n) => !n.read_at).length;
        setState({ phase: 'ready', notifications: data, unread });
      }
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        router.replace('/login');
        return;
      }
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Failed to load notifications.',
      });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleMarkRead(id: string) {
    const session = getSession();
    if (!session) return;
    try {
      await apiRequest(`/notifications/${id}/read`, {
        method: 'POST',
        token: session.accessToken,
        institutionId: session.institutionId,
      });
      void load();
    } catch {
      // ignore
    }
  }

  async function handleMarkAll() {
    const session = getSession();
    if (!session) return;
    try {
      await apiRequest('/notifications/read-all', {
        method: 'POST',
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
        <p>Loading notifications…</p>
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
        <h1>Notifications</h1>
        <div className="card">
          <p className="muted">No notifications yet.</p>
          <p className="muted">Relevant new notices and deadlines will appear here.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Notifications</h1>
        {state.unread > 0 && (
          <button type="button" className="secondary" onClick={() => void handleMarkAll()}>
            Mark all as read ({state.unread})
          </button>
        )}
      </div>
      <p className="muted">
        {state.notifications.length} notifications · {state.unread} unread
      </p>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {state.notifications.map((n) => (
          <article
            key={n.id}
            className="card"
            style={{
              margin: 0,
              opacity: n.read_at ? 0.7 : 1,
              borderLeft: n.read_at ? undefined : '4px solid #3b82f6',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{n.title}</h2>
              <span className={`badge ${n.type.toLowerCase()}`}>{n.type}</span>
            </div>
            <p style={{ margin: '0.5rem 0' }}>{n.body}</p>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {new Date(n.created_at).toLocaleString()} · {n.read_at ? 'Read' : 'Unread'}
              {n.entity_type && n.entity_id
                ? ` · ${n.entity_type}: ${n.entity_id.slice(0, 8)}`
                : ''}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              {!n.read_at && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleMarkRead(n.id)}
                >
                  Mark as read
                </button>
              )}
              {n.entity_type === 'document' && n.entity_id && (
                <Link href={`/documents/${n.entity_id}`} className="button secondary">
                  Open document
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
