'use client';

import { hasCapability, type DocumentStatus, type DocumentType, type Role } from '@ikp/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiEnvelopeRequest, apiRequest } from '../../../lib/api';
import { clearSession, getSession } from '../../../lib/auth';

interface DocumentListItem {
  id: string;
  title: string;
  document_type: DocumentType;
  department: { id: string; name: string } | null;
  status: DocumentStatus;
  published_at: string | null;
  summary: string | null;
}

interface MeResponse {
  id: string;
  name: string;
  email: string;
  memberships: { institution_id: string; role: Role }[];
}

type LoadState = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

const PAGE_LIMIT = 20;

export default function AdminDocumentsPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextPage: number, nextSearch: string, nextStatus: string) => {
      const current = getSession();
      if (!current) {
        router.replace('/login');
        return;
      }
      const query = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_LIMIT) });
      if (nextSearch) query.set('search', nextSearch);
      if (nextStatus) query.set('status', nextStatus);
      const [me, list] = await Promise.all([
        apiRequest<MeResponse>('/auth/me', { token: current.accessToken }),
        apiEnvelopeRequest<DocumentListItem[], { total: number }>(
          `/documents?${query.toString()}`,
          { token: current.accessToken, institutionId: current.institutionId },
        ),
      ]);
      const membership = me.memberships.find((m) => m.institution_id === current.institutionId);
      setRole(membership?.role ?? null);
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
    refresh(1, '', '')
      .then(() => setState({ phase: 'ready' }))
      .catch((requestError) => {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        setState({
          phase: 'error',
          message:
            requestError instanceof Error ? requestError.message : 'Failed to load documents.',
        });
      });
  }, [router, refresh]);

  async function runAction(action: string, document: DocumentListItem) {
    setError(null);
    setNotice(null);
    const current = getSession();
    if (!current) return;
    try {
      await apiRequest(`/documents/${document.id}/${action}`, {
        method: 'POST',
        token: current.accessToken,
        institutionId: current.institutionId,
      });
      await refresh(page, search, statusFilter);
      setNotice(`Document "${document.title}" updated.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Action failed.');
    }
  }

  async function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    await refresh(1, search, statusFilter);
  }

  const canApprove = role ? hasCapability(role, 'document.approve') : false;
  const canPublish = role ? hasCapability(role, 'document.publish') : false;
  const canEdit = role ? hasCapability(role, 'document.edit_draft') : false;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  if (state.phase === 'loading') {
    return <p>Loading documents…</p>;
  }
  if (state.phase === 'error') {
    return (
      <p className="error" role="alert">
        {state.message}
      </p>
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
        <h2>Documents</h2>
        <form className="form inline" onSubmit={applyFilters}>
          <input
            placeholder="Search title…"
            aria-label="Search documents"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_REVIEW">In review</option>
            <option value="APPROVED">Approved</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
            <option value="SUPERSEDED">Superseded</option>
          </select>
          <button type="submit">Apply</button>
        </form>

        {documents.length === 0 ? (
          <p className="muted">No documents found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Department</th>
                <th>Status</th>
                <th>Published</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>{document.title}</td>
                  <td>{document.document_type}</td>
                  <td>{document.department?.name ?? '—'}</td>
                  <td>
                    <span className={`badge ${document.status.toLowerCase()}`}>
                      {document.status}
                    </span>
                  </td>
                  <td>
                    {document.published_at
                      ? new Date(document.published_at).toLocaleDateString()
                      : '—'}
                  </td>
                  {canEdit && (
                    <td>
                      {document.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => void runAction('submit-review', document)}
                        >
                          Submit
                        </button>
                      )}
                      {document.status === 'IN_REVIEW' && canApprove && (
                        <button type="button" onClick={() => void runAction('approve', document)}>
                          Approve
                        </button>
                      )}
                      {document.status === 'APPROVED' && canPublish && (
                        <button type="button" onClick={() => void runAction('publish', document)}>
                          Publish
                        </button>
                      )}
                      {document.status === 'PUBLISHED' && canPublish && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void runAction('archive', document)}
                        >
                          Archive
                        </button>
                      )}
                    </td>
                  )}
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
              void refresh(page - 1, search, statusFilter);
            }}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page >= totalPages}
            onClick={() => {
              setPage(page + 1);
              void refresh(page + 1, search, statusFilter);
            }}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
