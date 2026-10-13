/**
 * Resolve where the API lives:
 *  - build-time override via VITE_API_BASE
 *  - dev: '' (vite proxy forwards /v1 → API)
 *  - Arena e2b preview: web app on port 5173 maps to the API preview on port 4000
 *    of the same sandbox host (https://{port}-{id}.e2b.app)
 *  - fallback: same origin (production deployments serve API + web together)
 */
export function apiBase(): string {
  const override = (import.meta as any).env?.VITE_API_BASE;
  if (override) return override.replace(/\/$/, '');
  const loc = window.location;
  const m = /^https:\/\/(\d{2,5})-(.+)\.e2b\.app$/.exec(loc.origin);
  if (m && m[1] !== '4000') return `https://4000-${m[2]}.e2b.app`;
  return loc.origin;
}

export function healthUrl(): string {
  return `${apiBase()}/ops/health`;
}
