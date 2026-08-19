/**
 * Text adequacy heuristic: whether extracted text is rich enough to treat as
 * a native (text-based) document, or whether OCR is required instead.
 * See `.agent/architecture/TECHNICAL_SPEC.md` §7 (OCR strategy).
 */
export const MIN_CHARS_PER_PAGE = 50;

export function isTextAdequate(text: string, pageCount: number | null): boolean {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return false;
  }
  if (!pageCount || pageCount <= 0) {
    return normalized.length >= MIN_CHARS_PER_PAGE;
  }
  return normalized.length / pageCount >= MIN_CHARS_PER_PAGE;
}
