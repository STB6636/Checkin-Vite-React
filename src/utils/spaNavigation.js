/**
 * @file src/utils/spaNavigation.js
 * @description Maps legacy .html page references to Vite + React HashRouter routes
 * so both React components and ported controllers navigate seamlessly without full reloads.
 */

const LEGACY_TO_ROUTE = {
  '': '/',
  '/': '/',
  'index.html': '/',
  'loading.html': '/loading',
  'checkin.html': '/checkin',
  'dashboard.html': '/dashboard',
  'approvals.html': '/approvals',
  'time-corrections.html': '/time-corrections',
  'reports.html': '/reports',
  'personnel.html': '/personnel',
  'users.html': '/users',
  'settings.html': '/settings',
};

export function toSpaRoute(target = '') {
  const raw = String(target || '').trim();
  if (!raw || raw === './' || raw === '/') return '/';

  // Separate query string if present (e.g. loading.html?entry=login)
  const [pathPart, queryPart] = raw.split('?');
  const cleaned = pathPart
    .replace(/^#/, '')
    .replace(/^(?:\.\/|\/)+/, '')
    .replace(/^.*\//, '');

  const normalizedKey = cleaned.toLowerCase();
  const baseRoute = LEGACY_TO_ROUTE[normalizedKey] || (raw.startsWith('/') ? pathPart : `/${cleaned.replace(/\.html$/i, '')}`);
  return queryPart ? `${baseRoute}?${queryPart}` : baseRoute;
}

export function navigateSpa(target, replace = false) {
  const route = toSpaRoute(target);
  const hashUrl = `#${route.startsWith('/') ? route : '/' + route}`;
  if (replace) {
    window.location.replace(hashUrl);
  } else {
    window.location.hash = hashUrl;
  }
}

export function getLegacyPageFromRoute(pathname = '') {
  const clean = String(pathname || '/').replace(/^\/+/, '').toLowerCase();
  if (!clean || clean === 'login') return 'index.html';
  return `${clean}.html`;
}
