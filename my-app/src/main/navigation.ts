/**
 * URL vs search query parsing.
 * Exact match ^https?:// → use as-is
 * Bare domain match → prepend https://
 * Otherwise → Google search
 */

const EXPLICIT_URL_RE = /^https?:\/\//i;
const BARE_DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i;
const GOOGLE_SEARCH_BASE = 'https://www.google.com/search?q=';

export function parseNavigationInput(input: string): string {
  const trimmed = input.trim();

  if (EXPLICIT_URL_RE.test(trimmed)) {
    return trimmed;
  }

  if (BARE_DOMAIN_RE.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return `${GOOGLE_SEARCH_BASE}${encodeURIComponent(trimmed)}`;
}
