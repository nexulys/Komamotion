/**
 * Keeps post-login redirects on this site. Only plain relative paths pass:
 * "//host" and "/\host" are protocol-relative to browsers, and they strip
 * tabs/newlines, so "/\t/host" would become "//host" too.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/projects"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) {
    return fallback;
  }
  return next;
}
