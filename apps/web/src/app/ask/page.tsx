'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError, apiEnvelopeRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

interface Citation {
  document_id: string;
  document_title: string;
  version_id: string;
  page: number | null;
}

interface AskResponse {
  answer: string;
  grounded: boolean;
  confidence: 'high' | 'medium' | 'low';
  citations: Citation[];
}

type AskState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'success'; response: AskResponse; question: string };

export default function AskPage() {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<AskState>({ phase: 'idle' });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setState({ phase: 'loading' });
    try {
      const envelope = await apiEnvelopeRequest<AskResponse>('/ai/ask', {
        method: 'POST',
        token: session.accessToken,
        institutionId: session.institutionId,
        body: { question: trimmed },
      });
      setState({ phase: 'success', response: envelope.data, question: trimmed });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        router.replace('/login');
        return;
      }
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Ask failed.',
      });
    }
  }

  return (
    <main>
      <h1>Ask Institution</h1>
      <p className="muted">
        Ask a natural-language question. Answers are source-grounded — every factual answer cites an
        official document. If no document is found, you&apos;ll get a safe unsupported response.
      </p>

      <form className="form" onSubmit={handleSubmit} aria-label="Ask institution">
        <label htmlFor="ask-question">Your question</label>
        <input
          id="ask-question"
          type="text"
          placeholder="When is the last date to submit the examination form?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-label="Institutional question"
          required
          maxLength={500}
        />
        <button type="submit" disabled={state.phase === 'loading'}>
          {state.phase === 'loading' ? 'Asking…' : 'Ask'}
        </button>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Try: &ldquo;When is exam form submission?&rdquo; · &ldquo;What is the hostel fee
          deadline?&rdquo; · &ldquo;Find the circular about late fee&rdquo;
        </p>
      </form>

      {state.phase === 'idle' && (
        <div className="card">
          <p className="muted">Ask about official notices, deadlines, and policies. Example:</p>
          <ul className="muted">
            <li>When is the examination form deadline?</li>
            <li>What documents are needed before graduation?</li>
            <li>Find the Examination Form Submission Notice</li>
          </ul>
          <p className="muted">Answers cite the source document — open the source to verify.</p>
        </div>
      )}

      {state.phase === 'loading' && (
        <div className="card" aria-busy="true" aria-live="polite">
          <p>Finding the authoritative source…</p>
          <p className="muted">
            Searching with permission-aware retrieval, then generating a grounded answer.
          </p>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="card" role="alert">
          <p className="error">{state.message}</p>
          <button type="button" onClick={() => setState({ phase: 'idle' })}>
            Try again
          </button>
        </div>
      )}

      {state.phase === 'success' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Answer</h2>
            <span className={`badge ${state.response.grounded ? 'published' : 'archived'}`}>
              {state.response.grounded
                ? `Grounded · ${state.response.confidence}`
                : 'Not grounded · low'}
            </span>
          </div>
          <p style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>{state.response.answer}</p>

          {state.response.citations.length > 0 ? (
            <>
              <h3 style={{ fontSize: '0.95rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
                Sources
              </h3>
              <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
                {state.response.citations.map((c, idx) => (
                  <li key={`${c.document_id}-${idx}`} style={{ marginBottom: '0.5rem' }}>
                    <Link href={`/documents/${c.document_id}`}>{c.document_title}</Link>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {' '}
                      — Page {c.page ?? '—'} · Version {c.version_id.slice(0, 8)}
                    </span>{' '}
                    <Link
                      href={`/documents/${c.document_id}`}
                      className="muted"
                      style={{ fontSize: '0.85rem' }}
                    >
                      [Open source]
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="muted" style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
              No official document was cited. This is the safe unsupported response.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.response.answer);
                } catch {
                  // ignore
                }
              }}
            >
              Copy answer
            </button>
            <Link href="/search" className="button secondary">
              Search instead
            </Link>
          </div>

          <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
            Question: “{state.question}” · Confidence: {state.response.confidence} ·{' '}
            {state.response.grounded ? 'Grounded in official documents' : 'Not grounded'}
          </p>
        </div>
      )}

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/search">← Back to search</Link> · <Link href="/">Home</Link>
      </p>
    </main>
  );
}
