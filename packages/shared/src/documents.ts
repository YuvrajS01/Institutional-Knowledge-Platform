import type { DocumentStatus } from './domain.js';

export interface CreateDocumentUploadResponse {
  document: {
    id: string;
    status: DocumentStatus;
    title: string;
  };
  upload: {
    upload_url: string;
    expires_at: string;
  };
}

export interface UploadCompleteResponse {
  document_id: string;
  processing_status: 'QUEUED';
}
