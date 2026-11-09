// Root-level Vercel middleware: the deployed password gate for /emr/kid.
// (Vercel only runs middleware from the project root; emr/kid/middleware.js is
// the dev mirror and never executes in production.)
import {
  buildLoginRedirect,
  getDefaultProtectedPath,
  isAuthenticatedCookieHeader,
  isProtectedPath,
  normalizeAppPath,
  shouldUseAppBase
} from './emr/kid/lib/auth.js';

export default async function middleware(request) {
  const { pathname, search } = new URL(request.url);
  const normalizedPath = normalizeAppPath(pathname);
  const authenticated = await isAuthenticatedCookieHeader(request.headers.get('cookie') || '');

  if (normalizedPath === '/password') {
    if (authenticated) {
      return Response.redirect(new URL(getDefaultProtectedPath(shouldUseAppBase(pathname)), request.url), 302);
    }
    return;
  }

  if (isProtectedPath(pathname) && !authenticated) {
    return Response.redirect(new URL(buildLoginRedirect(pathname, search), request.url), 302);
  }
}

export const config = {
  matcher: ['/emr/kid', '/emr/kid/:path*']
};
