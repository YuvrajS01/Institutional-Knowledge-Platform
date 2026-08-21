'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiRequest } from '../../../lib/api';
import { getSession } from '../../../lib/auth';

interface DocumentDetail {
  id: string;
  title: string;
  slug: string;
  document_type: string;
  status: string;
  department: { id: string; name: string } | null;
  published_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_current: boolean;
  superseded_by: { id: string; title: string } | null;
  superseded_at: string | null;
  superseded_reason: string | null;
  current_version_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  summary: string | null;
  metadata: {
    academic_year: string | null;
    course: string | null;
    semester: number | null;
    audience: Record<string, unknown>;
    tags: string[];
  };
}

interface Version {
  id: string;
  version_number: number;
  created_at: string;
  is_current: boolean;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; document: DocumentDetail; versions: Version[] };

export default function DocumentDetailPage() {
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
          message: error instanceof Error ? error.message : 'Failed to load document.',
        });
      });
  }, [params.id, router]);

  if (state.phase === 'loading') {
    return (
      <main>
        <p>Loading document…</p>
      </main>
    );
  }

  if (state.phase === 'error') {
    return (
      <main>
        <p className="error" role="alert">
          {state.message}
        </p>
        <Link href="/search">Back to search</Link>
      </main>
    );
  }

  const { document, versions } = state;

  return (
    <main>
      <Link href="/search" className="muted">
        ← Back to search
      </Link>

      <div style={{ marginTop: '1rem' }}>
        <span className={`badge ${document.status.toLowerCase()}`}>{document.status}</span>{' '}
        <span className={`badge ${document.is_current ? 'published' : 'archived'}`}>
          {document.is_current ? 'Current' : 'Not current'}
        </span>
        {document.superseded_by && (
          <span className="badge superseded" style={{ marginLeft: '0.5rem' }}>
            Superseded
          </span>
        )}
      </div>

      <h1>{document.title}</h1>
      <p className="muted">
        {document.department ? document.department.name : 'No department'} · {document.document_type} ·{' '}
        {document.published_at ? new Date(document.published_at).toLocaleDateString() : 'Unpublished'}
      </p>

      {document.summary ? (
        <div className="card" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Summary</h2>
          <p style={{ margin: 0, lineHeight: '1.6' }}>{document.summary}</p>
          <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            AI-generated summary — review before relying on it. Source remains the document.
          </p>
        </div>
      ) : (
        <div className="card" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <p className="muted" style={{ margin: 0 }}>
            No summary available yet. Processing may still be queued.
          </p>
        </div>
      )}

      {document.superseded_by && (
        <div className="card" style={{ borderColor: '#f59e0b', background: '#fffbeb' }}>
          <p>
            <strong>Superseded</strong> by{' '}
            <Link href={`/documents/${document.superseded_by.id}`}>{document.superseded_by.title || document.superseded_by.id}</Link>
            {document.superseded_at && ` on ${new Date(document.superseded_at).toLocaleDateString()}`}
          </p>
          {document.superseded_reason && <p className="muted">Reason: {document.superseded_reason}</p>}
          <p className="muted">This version is no longer current. See the current version above.</p>
        </div>
      )}

      {!document.is_current && document.status === 'PUBLISHED' && !document.superseded_by && (
        <div className="card" style={{ borderColor: '#e5e7eb' }}>
          <p className="muted">This document is published but not marked as current.</p>
        </div>
      )}

      <div className="card">
        <h2>Document information</h2>
        <p>
          <strong>Slug:</strong> {document.slug}
        </p>
        <p>
          <strong>Type:</strong> {document.document_type}
        </p>
        <p>
          <strong>Published:</strong> {document.published_at ? new Date(document.published_at).toLocaleString() : 'Not published'}
        </p>
        {document.effective_from && (
          <p>
            <strong>Effective from:</strong> {new Date(document.effective_from).toLocaleDateString()}
          </p>
        )}
        {document.effective_to && (
          <p>
            <strong>Effective to:</strong> {new Date(document.effective_to).toLocaleDateString()}
          </p>
        )}
        <p>
          <strong>Current version:</strong> {document.current_version_id ?? 'None'}
        </p>
        <p>
          <strong>Tags:</strong> {document.metadata.tags.length > 0 ? document.metadata.tags.join(', ') : 'None'}
        </p>
        {document.metadata.academic_year && (
          <p>
            <strong>Academic year:</strong> {document.metadata.academic_year}
          </p>
        )}
        {document.metadata.course && (
          <p>
            <strong>Course:</strong> {document.metadata.course}
          </p>
        )}
        {document.metadata.semester && (
          <p>
            <strong>Semester:</strong> {document.metadata.semester}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Version history</h2>
        {versions.length === 0 ? (
          <p className="muted">No versions.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Created</th>
                <th>Current</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>v{v.version_number}</td>
                  <td>{new Date(v.created_at).toLocaleString()}</td>
                  <td>{v.is_current ? '✓ Current' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Actions</h2>
        <p className="muted">Source of truth is the approved institutional document.</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}/documents/${document.id}`;
              navigator.clipboard.writeText(url).catch(() => {});
            }}
          >
            Copy link
          </button>
          <Link href={`/search?q=${encodeURIComponent(document.title)}`} className="secondary-link">
            Search related
          </Link>
        </div>
      </div>
    </main>
  );
}
