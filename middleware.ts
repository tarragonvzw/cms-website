import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const locales = ['nl', 'en'];

export default clerkMiddleware((auth, request) => {
  const { pathname } = request.nextUrl;

  // Check if the pathname is missing a locale
  const pathnameIsMissingLocale = locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  // If it's missing a locale, redirect to /nl/pathname
  // But exclude /api, /_next, /images, /uploads, /admin, /event, favicon.ico, sitemap.xml, etc.
  if (
    pathnameIsMissingLocale &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/images') &&
    !pathname.startsWith('/uploads') &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/event') &&
    !pathname.startsWith('/dragon') &&
    !pathname.startsWith('/quiz') &&
    !pathname.startsWith('/sitemap.xml') &&
    !pathname.startsWith('/robots.txt') &&
    !pathname.includes('.')
  ) {
    const targetPath = pathname === '/' ? '/nl' : `/nl${pathname}`;
    const url = new URL(targetPath, request.url);
    return NextResponse.redirect(url, 301);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
