/**
 * Storage key layout, per `.agent/architecture/TECHNICAL_SPEC.md` §16:
 *
 *   /{institution_id}/documents/{document_id}/v{version}/original.{ext}
 *   /{institution_id}/documents/{document_id}/v{version}/extracted.txt
 *   /{institution_id}/documents/{document_id}/v{version}/ocr.json
 *   /{institution_id}/documents/{document_id}/v{version}/preview/page-001.png
 *
 * Keys are always derived server-side from validated ids — never from client
 * input (users cannot construct arbitrary storage keys).
 */

export interface DocumentKeyContext {
  institutionId: string;
  documentId: string;
  version: number;
}

export function documentVersionPrefix(context: DocumentKeyContext): string {
  return `${context.institutionId}/documents/${context.documentId}/v${context.version}`;
}

export function originalFileKey(context: DocumentKeyContext, extension: string): string {
  const normalizedExtension = extension.replace(/^\./, '').toLowerCase();
  return `${documentVersionPrefix(context)}/original.${normalizedExtension}`;
}

export function extractedTextKey(context: DocumentKeyContext): string {
  return `${documentVersionPrefix(context)}/extracted.txt`;
}

export function ocrResultKey(context: DocumentKeyContext): string {
  return `${documentVersionPrefix(context)}/ocr.json`;
}

export function pagePreviewKey(context: DocumentKeyContext, page: number): string {
  const pageLabel = String(page).padStart(3, '0');
  return `${documentVersionPrefix(context)}/preview/page-${pageLabel}.png`;
}
