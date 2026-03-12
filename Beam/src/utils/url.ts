/**
 * URL utility functions for Beam Browser.
 * Handles URL parsing, search detection, and formatting.
 */

/** Check if a string looks like a valid URL (has TLD or scheme) */
export function isLikelyUrl(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed) return false;

  // Has explicit scheme
  if (/^https?:\/\//i.test(trimmed)) return true;

  // localhost or IP-like
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?/i.test(trimmed)) return true;

  // Has a dot, no spaces, and looks like a domain
  if (trimmed.includes('.') && !trimmed.includes(' ') && /^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return true;
  }

  return false;
}

/** Parse user input into a navigable URL */
export async function parseUrlInput(input: unknown): Promise<string> {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Already has scheme
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Internal pages
  if (trimmed.startsWith('beam://')) return trimmed;

  // Looks like a URL → add https://
  if (isLikelyUrl(trimmed)) {
    return `https://${trimmed}`;
  }

  // Otherwise treat as search query - use configured search engine
  try {
    if (window.electronAPI?.settingsGetSearchUrl) {
      const searchUrl = await window.electronAPI.settingsGetSearchUrl(trimmed);
      // Ensure we got a valid string back
      if (typeof searchUrl === 'string' && searchUrl.length > 0) {
        return searchUrl;
      }
    }
  } catch (e) {
    console.warn('Failed to get search URL from settings:', e);
  }
  
  // Fallback to DuckDuckGo
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

/** Extract display-friendly URL (strip scheme for display) */
export function formatDisplayUrl(url: unknown): string {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('beam://')) return '';
  return url.replace(/^https?:\/\//, '');
}

/** Extract hostname from a URL */
export function getHostname(url: unknown): string {
  if (typeof url !== 'string') return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Get Google favicon service URL */
export function getFaviconUrl(pageUrl: unknown): string {
  const hostname = getHostname(pageUrl);
  if (!hostname) return '';
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
}

/** Check if a URL is an internal new-tab page */
export function isNewTabUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  return url === 'beam://newtab' || url === '' || url === 'about:blank';
}

/** Check if a URL is the agent panel */
export function isAgentUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  return url === 'beam://agent' || url === 'about:agent';
}
