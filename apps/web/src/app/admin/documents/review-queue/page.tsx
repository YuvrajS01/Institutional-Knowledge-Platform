'use client';

import type { DocumentType } from '@ikp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiEnvelopeRequest, apiRequest } from '../../../../lib/api';
import { clearSession, getSession } from '../../../../lib/auth';

interface ReviewQueueItem {
  id: string;
  title: string;
  document_type: DocumentType;
  department: { id: string; name: string } | null;
  status: string;
  published_at: string | null;
  summary: string | null;
}

type LoadState = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

const PAGE_LIMIT = 20;

export default function ReviewQueuePage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [documents, setDocuments] = useState<ReviewQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextPage: number, nextSearch: string) => {
      const current = getSession();
      if (!current) {
        router.replace('/login');
        return;
      }
      const query = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_LIMIT) });
      if (nextSearch) query.set('search', nextSearch);
      const list = await apiEnvelopeRequest<ReviewQueueItem[], { total: number }>(
        `/documents/review-queue?${query.toString()}`,
        { token: current.accessToken, institutionId: current.institutionId },
      );
      setDocuments(list.data);
      setTotal(list.meta?.total ?? 0);
    },
    [router],
  );

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace('/login');
      return;
    }
    refresh(1, '')
      .then(() => setState({ phase: 'ready' }))
      .catch((requestError) => {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        if (requestError instanceof ApiError && requestError.statusCode === 403) {
          setState({ phase: 'error', message: 'You do not have permission to view the review queue.' });
          return;
        }
        setState({
          phase: 'error',
          message: requestError instanceof Error ? requestError.message : 'Failed to load review queue.',
        });
      });
  }, [router, refresh]);

  async function handleApprove(document: ReviewQueueItem) {
    setError(null);
    setNotice(null);
    const current = getSession();
    if (!current) return;
    try {
      await apiRequest(`/documents/${document.id}/approve`, {
        method: 'POST',
        token: current.accessToken,
        institutionId: current.institutionId,
      });
      setNotice(`Approved "${document.title}".`);
      await refresh(page, search);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Approve failed.');
    }
  }

  async function handleReturnToDraft(document: ReviewQueueItem) {
    setError(null);
    setNotice(null);
    const current = getSession();
    if (!current) return;
    try {
      await apiRequest(`/documents/${document.id}/reject`, {
        method: 'POST',
        token: current.accessToken,
        institutionId: current.institutionId,
      });
      setNotice(`Returned "${document.title}" to draft.`);
      await refresh(page, search);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Return to draft failed.');
    }
  }

  async function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    await refresh(1, search);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  if (state.phase === 'loading') {
    return <p>Loading review queue…</p>;
  }
  if (state.phase === 'error') {
    return (
      <div>
        <p className="error" role="alert">
          {state.message}
        </p>
        <Link href="/admin/documents">Back to documents</Link>
      </div>
    );
  }

  return (
    <div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Review queue</h2>
          <Link href="/admin/documents" className="secondary-link">
            All documents
          </Link>
        </div>
        <p className="muted">Documents awaiting approval (IN_REVIEW). Only APPROVER and above can see this queue.</p>

        <form className="form inline" onSubmit={applyFilters} style={{ marginTop: '1rem' }}>
          <input
            placeholder="Search title…"
            aria-label="Search review queue"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        {documents.length === 0 ? (
          <p className="muted" style={{ marginTop: '1rem' }}>
            No documents in review. When authors submit drafts, they will appear here.
          </p>
        ) : (
          <table style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Department</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <Link href={`/documents/${document.id}`}>{document.title}</Link>
                  </td>
                  <td>{document.document_type}</td>
                  <td>{document.department?.name ?? '—'}</td>
                  <td>
                    <span className={`badge ${document.status.toLowerCase()}`}>{document.status}</span>
                  </td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => void handleApprove(document)}>
                      Approve
                    </button>
                    <button type="button" className="secondary" onClick={() => void handleReturnToDraft(document)}>
                      Return
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="pagination">
          <button
            type="button"
            className="secondary"
            disabled={page <= 1}
            onClick={() => {
              setPage(page - 1);
              void refresh(page - 1, search);
            }}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page >= totalPages}
            onClick={() => {
              setPage(page + 1);
              void refresh(page + 1, search);
            }}
          >
            Next
          </button>
        </div>

        <div style={{ marginTop: '1rem' }} className="muted">
          <p>
            Tip: Approve moves a document to <code>APPROVED</code>. An INSTITUTION_ADMIN can then <em>Publish</em> it from the documents list.
          </p>
        </div>
      </section>
    </div>
  );
}
