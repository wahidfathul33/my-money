/**
 * Module augmentation: `session.user.id` — populated by the `session`
 * callback in src/lib/auth/options.ts, required by `requireUser()`.
 */
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export {};
