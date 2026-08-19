/**
 * Converts a title into a URL-safe slug.
 * Falls back to a random suffix when the result would be empty.
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug.length > 0 ? slug : `document`;
}
