/**
 * The one NextAuth() instance for the app. `auth()` is callable directly
 * from Server Components, Route Handlers, Server Actions, and proxy.ts
 * (Next.js 16's renamed middleware — docs/11-tech-architecture.md §2)
 * without any client-side `SessionProvider` — that's the point of the v5
 * unified API.
 */
import NextAuth from 'next-auth';
import { buildAuthConfig } from './options';

export const { handlers, auth, signIn, signOut } = NextAuth(buildAuthConfig());
