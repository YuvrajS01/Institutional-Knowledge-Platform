'use client';

import type { DocumentStatus } from '@ikp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError, apiRequest } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth';

interface CreateUploadResponse {
  document: { id: string; status: DocumentStatus; title: string };
  upload: { upload_url: string; expires_at: string };
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type Phase = 'form' | 'uploading' | 'queued' | 'error';

export default function UploadDocumentPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('NOTICE');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [status, setStatus] = useState<DocumentStatus>('DRAFT');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function validateFile(selected: File | null): string | null {
    if (!selected) return 'Please choose a file.';
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      return `Unsupported file type: ${selected.type || 'unknown'}.`;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      return 'File exceeds the 25 MB limit.';
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const fileError = validateFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!file) return;

    setPhase('uploading');
    try {
      const tagList = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const created = await apiRequest<CreateUploadResponse>('/documents', {
        method: 'POST',
        token: session.accessToken,
        institutionId: session.institutionId,
        body: {
          title,
          document_type: documentType,
          mime_type: file.type,
          tags: tagList,
        },
      });

      const put = await fetch(created.upload.upload_url, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: new Uint8Array(await file.arrayBuffer()),
      });
      if (!put.ok) {
        throw new Error('The file upload to storage failed.');
      }

      await apiRequest(`/documents/${created.document.id}/upload-complete`, {
        method: 'POST',
        token: session.accessToken,
        institutionId: session.institutionId,
      });

      setDocumentId(created.document.id);
      setStatus(created.document.status);
      setPhase('queued');
      setNotice('Document uploaded. Processing is queued.');
    } catch (requestError) {
      setPhase('error');
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : 'Upload failed.',
      );
    }
  }

  async function runAction(action: string) {
    if (!documentId) return;
    setError(null);
    setNotice(null);
    const session = getSession();
    if (!session) return;
    try {
      const response = await apiRequest<{ status: DocumentStatus }>(
        `/documents/${documentId}/${action}`,
        { method: 'POST', token: session.accessToken, institutionId: session.institutionId },
      );
      setStatus(response.status);
      setNotice(`Document ${action.replace('-', ' ')}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Action failed.');
    }
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

      {phase === 'form' && (
        <section className="card">
          <h2>Upload document</h2>
          <form className="form" onSubmit={handleSubmit}>
            <label htmlFor="upload-title">Title</label>
            <input
              id="upload-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />

            <label htmlFor="upload-type">Document type</label>
            <select
              id="upload-type"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            >
              <option value="NOTICE">Notice</option>
              <option value="CIRCULAR">Circular</option>
              <option value="POLICY">Policy</option>
              <option value="FORM">Form</option>
              <option value="SCHEDULE">Schedule</option>
              <option value="REPORT">Report</option>
              <option value="OTHER">Other</option>
            </select>

            <label htmlFor="upload-tags">Tags (comma separated)</label>
            <input
              id="upload-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="exam, form, semester-6"
            />

            <label htmlFor="upload-file">File</label>
            <input
              id="upload-file"
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />

            <button type="submit">Upload</button>
          </form>
        </section>
      )}

      {phase === 'uploading' && <p>Uploading and confirming…</p>}

      {phase === 'queued' && documentId && (
        <section className="card">
          <h2>Document ready</h2>
          <p className="muted">
            Processing is queued (OCR / text extraction will run in the background).
          </p>
          <p>
            Status: <span className={`badge ${status.toLowerCase()}`}>{status}</span>
          </p>
          <div className="pagination">
            <Link className="secondary-link" href="/admin/documents">
              Back to documents
            </Link>
            {status === 'DRAFT' && (
              <button type="button" onClick={() => void runAction('submit-review')}>
                Submit for review
              </button>
            )}
            {status === 'IN_REVIEW' && (
              <button type="button" onClick={() => void runAction('approve')}>
                Approve
              </button>
            )}
            {status === 'APPROVED' && (
              <button type="button" onClick={() => void runAction('publish')}>
                Publish
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
