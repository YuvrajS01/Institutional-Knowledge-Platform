'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiRequest } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth';

interface Version {
  id: string;
  version_number: number;
  created_at: string;
  is_current: boolean;
  status?: string;
  superseded_by?: string | null;
}

interface DocumentDetail {
  id: string;
  title: string;
  status: string;
  is_current: boolean;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; document: DocumentDetail; versions: Version[] };

export default function VersionHistoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const documentId = params.id;
    if (!documentId) {
      setState({ phase: 'error', message: 'Missing document id.' });
      return;
    }

    Promise.all([
      apiRequest<DocumentDetail>(`/documents/${documentId}`, {
        token: session.accessToken,
        institutionId: session.institutionId,
      }),
      apiRequest<Version[]>(`/documents/${documentId}/versions`, {
        token: session.accessToken,
        institutionId: session.institutionId,
      }).catch(() => [] as Version[]),
    ])
      .then(([document, versions]) => {
        setState({ phase: 'ready', document, versions: Array.isArray(versions) ? versions : [] });
      })
      .catch((error) => {
        if (error instanceof ApiError && error.statusCode === 401) {
          router.replace('/login');
          return;
        }
        if (error instanceof ApiError && error.statusCode === 404) {
          setState({ phase: 'error', message: 'Document not found or not visible.' });
          return;
        }
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : 'Failed to load version history.',
        });
      });
  }, [params.id, router]);

  if (state.phase === 'loading') {
    return (
      <main>
        <p>Loading version history…</p>
      </main>
    );
  }

  if (state.phase === 'error') {
    return (
      <main>
        <p className="error" role="alert">
          {state.message}
        </p>
        <Link href={`/documents/${params.id}`}>Back to document</Link> ·{' '}
        <Link href="/search">Back to search</Link>
      </main>
    );
  }

  const { document, versions } = state;
  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);

  return (
    <main>
      <Link href={`/documents/${params.id}`} className="muted">
        ← Back to {document.title}
      </Link>

      <h1>Version history — {document.title}</h1>
      <p className="muted">
        {document.status} · {document.is_current ? 'Current' : 'Not current'} · {versions.length}{' '}
        version{versions.length !== 1 ? 's' : ''}
      </p>

      <div className="card">
        <p className="muted">
          Source of truth is the current institutional document. Older versions are preserved for
          audit.
        </p>
      </div>

      {versions.length === 0 ? (
        <div className="card">
          <p className="muted">No versions found.</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Created</th>
                <th>Status</th>
                <th>Current</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>v{v.version_number}</strong>
                    <br />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {v.id.slice(0, 8)}
                    </span>
                  </td>
                  <td>{new Date(v.created_at).toLocaleString()}</td>
                  <td>
                    {v.is_current ? (
                      <span className="badge published">Current</span>
                    ) : v.status ? (
                      <span className={`badge ${v.status.toLowerCase()}`}>{v.status}</span>
                    ) : (
                      <span className="badge archived">Archived</span>
                    )}
                  </td>
                  <td>{v.is_current ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>About versions</h2>
        <p className="muted" style={{ margin: 0 }}>
          Each publish creates a new version. Superseded documents remain accessible for audit but
          are not returned as current in search or RAG. Use supersession to link the current
          document.
        </p>
      </div>

      <p>
        <Link href={`/documents/${params.id}`}>Back to document</Link> ·{' '}
        <Link href="/search">Search</Link>
      </p>
    </main>
  );
}
