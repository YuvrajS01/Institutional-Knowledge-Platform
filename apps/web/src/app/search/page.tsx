'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ApiError, apiEnvelopeRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

interface SearchResult {
  document_id: string;
  title: string;
  score: number;
  summary: string | null;
  match_reasons: string[];
  published_at: string | null;
  is_current: boolean;
  lexical_score?: number;
  semantic_score?: number;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  facets: {
    departments: { id: string; name: string; count: number }[];
    document_types?: { type: string; count: number }[];
  };
}

interface SearchMeta {
  total: number;
  latency_ms: number;
}

type SearchState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'empty'; query: string }
  | {
      phase: 'success';
      query: string;
      results: SearchResult[];
      meta: SearchMeta;
      facets: SearchResponse['facets'];
    };

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [departmentId, setDepartmentId] = useState(searchParams.get('department_id') ?? '');
  const [documentType, setDocumentType] = useState(searchParams.get('document_type') ?? '');
  const [academicYear, setAcademicYear] = useState(searchParams.get('academic_year') ?? '');
  const [course, setCourse] = useState(searchParams.get('course') ?? '');
  const [semester, setSemester] = useState(searchParams.get('semester') ?? '');
  const [tag, setTag] = useState(searchParams.get('tag') ?? '');
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(
      searchParams.get('academic_year') ||
        searchParams.get('course') ||
        searchParams.get('semester') ||
        searchParams.get('tag'),
    ),
  );
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));
  const [state, setState] = useState<SearchState>(
    initialQuery ? { phase: 'loading' } : { phase: 'idle' },
  );

  type SearchOpts = {
    page: number;
    departmentId: string;
    documentType: string;
    academicYear: string;
    course: string;
    semester: string;
    tag: string;
  };

  async function executeSearch(q: string, opts: SearchOpts) {
    const trimmed = q.trim();
    if (!trimmed) {
      setState({ phase: 'idle' });
      return;
    }
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setState({ phase: 'loading' });
    const params = new URLSearchParams({
      q: trimmed,
      page: String(opts.page),
      limit: '20',
    });
    if (opts.departmentId) params.set('department_id', opts.departmentId);
    if (opts.documentType) params.set('document_type', opts.documentType);
    if (opts.academicYear) params.set('academic_year', opts.academicYear);
    if (opts.course) params.set('course', opts.course);
    if (opts.semester) params.set('semester', opts.semester);
    if (opts.tag) params.set('tag', opts.tag);

    try {
      const full = await apiEnvelopeRequest<SearchResponse, SearchMeta>(
        `/search?${params.toString()}`,
        {
          token: session.accessToken,
          institutionId: session.institutionId,
        },
      );
      const data = full.data;
      const meta = full.meta ?? { total: data.results.length, latency_ms: 0 };
      if (data.results.length === 0) {
        setState({ phase: 'empty', query: trimmed });
      } else {
        setState({
          phase: 'success',
          query: trimmed,
          results: data.results,
          meta,
          facets: data.facets,
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        router.replace('/login');
        return;
      }
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Search failed.',
      });
    }
  }

  // Initial load from URL
  useEffect(() => {
    if (initialQuery) {
      void executeSearch(initialQuery, {
        page,
        departmentId,
        documentType,
        academicYear,
        course,
        semester,
        tag,
      });
    }
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (departmentId) params.set('department_id', departmentId);
    if (documentType) params.set('document_type', documentType);
    if (academicYear) params.set('academic_year', academicYear);
    if (course) params.set('course', course);
    if (semester) params.set('semester', semester);
    if (tag) params.set('tag', tag);
    if (page !== 1) params.set('page', String(page));
    router.push(`/search?${params.toString()}`);
    void executeSearch(query, { page, departmentId, documentType, academicYear, course, semester, tag });
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/search?${params.toString()}`);
    void executeSearch(query || initialQuery, {
      page: newPage,
      departmentId,
      documentType,
      academicYear,
      course,
      semester,
      tag,
    });
  }

  function clearFilters() {
    setDepartmentId('');
    setDocumentType('');
    setAcademicYear('');
    setCourse('');
    setSemester('');
    setTag('');
    setShowAdvanced(false);
  }

  return (
    <main>
      <h1>Search</h1>
      <p className="muted">
        Find the authoritative source — even when you only remember the meaning. Or{' '}
        <Link href="/ask">Ask Institution</Link> for a grounded answer with citations.
      </p>

      <form className="form" onSubmit={handleSubmit} role="search" aria-label="Document search">
        <label htmlFor="search-q">Search</label>
        <input
          id="search-q"
          type="search"
          placeholder="Search anything in your institution…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search query"
        />

        <div className="form inline">
          <label htmlFor="search-dept" className="muted" style={{ minWidth: 'auto' }}>
            Department
          </label>
          <select
            id="search-dept"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            aria-label="Department filter"
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
            }}
          >
            <option value="">All departments</option>
          </select>

          <label htmlFor="search-type" className="muted" style={{ minWidth: 'auto' }}>
            Type
          </label>
          <select
            id="search-type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            aria-label="Document type filter"
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
            }}
          >
            <option value="">All types</option>
            <option value="NOTICE">Notice</option>
            <option value="CIRCULAR">Circular</option>
            <option value="POLICY">Policy</option>
            <option value="FORM">Form</option>
            <option value="SCHEDULE">Schedule</option>
            <option value="REPORT">Report</option>
            <option value="OTHER">Other</option>
          </select>

          <button
            type="button"
            className="secondary"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            aria-controls="advanced-filters"
          >
            {showAdvanced ? 'Hide filters' : 'More filters'}
          </button>

          {(departmentId || documentType || academicYear || course || semester || tag) && (
            <button type="button" className="secondary" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>

        {showAdvanced && (
          <div id="advanced-filters" className="card" style={{ margin: 0, padding: '1rem', background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label htmlFor="search-year" className="muted" style={{ fontSize: '0.85rem' }}>
                  Academic year
                </label>
                <input
                  id="search-year"
                  type="text"
                  placeholder="2023-2024"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  aria-label="Academic year filter"
                  style={{ width: '100%', marginTop: '0.25rem' }}
                />
              </div>
              <div>
                <label htmlFor="search-course" className="muted" style={{ fontSize: '0.85rem' }}>
                  Course
                </label>
                <input
                  id="search-course"
                  type="text"
                  placeholder="BTECH"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  aria-label="Course filter"
                  style={{ width: '100%', marginTop: '0.25rem' }}
                />
              </div>
              <div>
                <label htmlFor="search-sem" className="muted" style={{ fontSize: '0.85rem' }}>
                  Semester
                </label>
                <input
                  id="search-sem"
                  type="number"
                  min={1}
                  max={12}
                  placeholder="3"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  aria-label="Semester filter"
                  style={{ width: '100%', marginTop: '0.25rem' }}
                />
              </div>
              <div>
                <label htmlFor="search-tag" className="muted" style={{ fontSize: '0.85rem' }}>
                  Tag
                </label>
                <input
                  id="search-tag"
                  type="text"
                  placeholder="examination"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  aria-label="Tag filter"
                  style={{ width: '100%', marginTop: '0.25rem' }}
                />
              </div>
            </div>
          </div>
        )}

        <button type="submit">Search</button>
      </form>

      {state.phase === 'idle' && (
        <div className="card">
          <p className="muted">Try asking:</p>
          <ul className="muted">
            <li>When is exam form submission?</li>
            <li>Find the hostel fee notice</li>
            <li>notice about late fee for forms</li>
          </ul>
        </div>
      )}

      {state.phase === 'loading' && (
        <div className="card" aria-busy="true" aria-live="polite">
          <p>Searching…</p>
          <div className="muted">Looking for the authoritative source.</div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="card" role="alert">
          <p className="error">{state.message}</p>
          <button
            type="button"
            onClick={() =>
              void executeSearch(query || initialQuery, {
                page,
                departmentId,
                documentType,
                academicYear,
                course,
                semester,
                tag,
              })
            }
          >
            Retry
          </button>
        </div>
      )}

      {state.phase === 'empty' && (
        <div className="card">
          <h2>We couldn&apos;t find an official document matching that search.</h2>
          <p className="muted">Suggestions:</p>
          <ul className="muted">
            <li>Try fewer words.</li>
            <li>Remove date terms.</li>
            <li>Search by department.</li>
            <li>Try a broader phrase.</li>
          </ul>
          <p className="muted">Query: “{state.query}”</p>
        </div>
      )}

      {state.phase === 'success' && (
        <>
          <div className="section-head">
            <p className="muted">
              {state.meta.total} results · {state.meta.latency_ms} ms
            </p>
            <span className="muted">
              {state.facets.departments.length > 0 && `Depts: ${state.facets.departments.length}`}
              {state.facets.departments.length > 0 &&
                state.facets.document_types &&
                state.facets.document_types.length > 0 &&
                ' · '}
              {state.facets.document_types && state.facets.document_types.length > 0
                ? `Types: ${state.facets.document_types.map((t) => `${t.type}(${t.count})`).join(', ')}`
                : ''}
            </span>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {state.results.map((result) => (
              <article key={result.document_id} className="card" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                    <Link href={`/documents/${result.document_id}`}>{result.title}</Link>
                  </h2>
                  <span className={`badge ${result.is_current ? 'published' : 'archived'}`}>
                    {result.is_current ? 'Current' : 'Not current'}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  {result.published_at
                    ? new Date(result.published_at).toLocaleDateString()
                    : 'Unpublished'}{' '}
                  · Score {result.score.toFixed(3)}
                  {result.match_reasons.length > 0 && ` · ${result.match_reasons.join(', ')}`}
                </p>
                {result.summary && <p>{result.summary}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <Link href={`/documents/${result.document_id}`} className="button">
                    Open
                  </Link>
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}/documents/${result.document_id}`,
                        );
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Share
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="pagination">
            <button type="button" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
              Previous
            </button>
            <span className="muted">Page {page}</span>
            <button
              type="button"
              disabled={state.results.length < 20}
              onClick={() => handlePageChange(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main>
          <p>Loading search…</p>
        </main>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
