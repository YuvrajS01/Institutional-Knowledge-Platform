'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiEnvelopeRequest } from '../../lib/api';
import { clearSession, getSession } from '../../lib/auth';

interface ImportantDate {
  id: string;
  title: string;
  date: string;
  raw: string;
  type: string | null;
  label: string | null;
  context: string | null;
  source_document_id: string;
  source_document_title: string;
  department_id: string | null;
  course: string | null;
  semester: number | null;
}

type LoadState = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

export default function ImportantDatesPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [dates, setDates] = useState<ImportantDate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchDates = useCallback(
    async (nextPage: number, nextFrom: string, nextTo: string) => {
      const session = getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const query = new URLSearchParams({ page: String(nextPage), limit: '20' });
      if (nextFrom) query.set('from', nextFrom);
      if (nextTo) query.set('to', nextTo);
      const result = await apiEnvelopeRequest<ImportantDate[], { total: number }>(
        `/dates?${query.toString()}`,
        { token: session.accessToken, institutionId: session.institutionId },
      );
      setDates(result.data);
      setTotal(result.meta?.total ?? result.data.length);
    },
    [router],
  );

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    fetchDates(1, '', '')
      .then(() => setState({ phase: 'ready' }))
      .catch((err) => {
        if (err instanceof ApiError && err.statusCode === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        setState({ phase: 'error', message: err instanceof Error ? err.message : 'Failed to load dates.' });
      });
  }, [router, fetchDates]);

  async function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPage(1);
    try {
      await fetchDates(1, from, to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to filter.');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  if (state.phase === 'loading') {
    return (
      <main>
        <p>Loading important dates…</p>
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

  return (
    <main>
      <Link href="/search" className="muted">
        ← Back to search
      </Link>
      <h1>Important dates</h1>
      <p className="muted">Deadlines, exams and events extracted from published documents.</p>

      <form className="form inline" onSubmit={applyFilters} style={{ marginTop: '1rem' }}>
        <label htmlFor="dates-from" className="sr-only">
          From
        </label>
        <input id="dates-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <label htmlFor="dates-to" className="sr-only">
          To
        </label>
        <input id="dates-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        <button type="submit">Filter</button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setFrom('');
            setTo('');
            setPage(1);
            void fetchDates(1, '', '');
          }}
        >
          Clear
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {dates.length === 0 ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <p className="muted">No important dates found. When documents with deadlines are published, they will appear here.</p>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Try adjusting the date filters or check the documents list.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
          {dates.map((d) => (
            <div key={d.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{d.title}</h3>
                  <p className="muted" style={{ margin: '0.25rem 0' }}>
                    {new Date(d.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}{' '}
                    {d.type && <span className={`badge ${d.type.toLowerCase()}`}>{d.type}</span>}{' '}
                    {d.label && <span className="badge">{d.label}</span>}
                  </p>
                  {d.context && <p style={{ margin: '0.5rem 0', fontStyle: 'italic' }}>&ldquo;{d.context}&rdquo;</p>}
                  <p className="muted" style={{ fontSize: '0.85rem' }}>
                    Raw: {d.raw} · Source:{' '}
                    <Link href={`/documents/${d.source_document_id}`} className="secondary-link">
                      {d.source_document_title}
                    </Link>
                  </p>
                </div>
                <Link href={`/documents/${d.source_document_id}`} className="button" style={{ whiteSpace: 'nowrap' }}>
                  Open source
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pagination" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="secondary"
          disabled={page <= 1}
          onClick={() => {
            setPage(page - 1);
            void fetchDates(page - 1, from, to);
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
            void fetchDates(page + 1, from, to);
          }}
        >
          Next
        </button>
      </div>
    </main>
  );
}
