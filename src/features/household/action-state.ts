/**
 * Shared `useActionState` shape + error-to-copy mapping for every household
 * Server Action file (`actions.ts` from task 10, `invitations.ts` and
 * `members.ts` from task 11). Deliberately NOT a "use server" file — a
 * module Next.js treats as server-action-only may only export async
 * functions (every other export becomes a build error), and `ActionState`
 * plus `toActionError` are a type and a synchronous helper, neither of
 * which qualifies.
 */
import { AppError, ValidationError } from '@/lib/api/errors';

export interface ActionState {
  error: string | null;
}

export const OK: ActionState = { error: null };

/**
 * Turns a thrown domain error into a message safe to show the user, per
 * docs/08-copywriting.md §5.7. Every `AppError` subclass's message is
 * already user-facing copy written at its throw site
 * (src/lib/api/errors.ts, src/lib/auth/require-household.ts) and never
 * names the household or a member (docs/12 §5 H9) — anything that isn't an
 * `AppError` at all is a genuine bug and re-thrown to the error boundary
 * instead of being swallowed into a generic message.
 */
export function toActionError(err: unknown): ActionState {
  if (err instanceof ValidationError) {
    return { error: Object.values(err.fields)[0]?.[0] ?? 'Validasi gagal' };
  }
  if (err instanceof AppError) {
    return { error: err.message };
  }
  throw err;
}
