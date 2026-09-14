/**
 * User preferences service — dbWrite lives here, per
 * docs/11-tech-architecture.md §3. Minimal on purpose: docs/06-api-contracts.md
 * §5 lists `updatePreferencesAction` under a general "Settings" catalog
 * (alongside `updateProfileAction`/`exportDataAction`/`deleteAccountAction`,
 * none of which exist yet), but task 18 (debts-receivables) only needs the
 * ONE preference it introduces — `count_receivables_as_asset` (ADR-010).
 * A future settings task is free to extend `UpdatePreferencesInput` and
 * this function to cover the rest of `users`' preference columns
 * (`default_currency`, `timezone`, `locale`) without needing to rename
 * anything here.
 */
import { eq } from 'drizzle-orm';
import { dbWrite } from '@/lib/db/write';
import { users } from '@/lib/db/schema/users';

export interface UpdatePreferencesInput {
  /** ADR-010: whether receivables count toward net worth as an asset.
   * Default `false` — personal receivables have a high default rate, so net
   * worth stays conservative unless the user opts in. */
  countReceivablesAsAsset: boolean;
}

/** A single-column, single-statement update — no multi-step invariant to
 * protect, so (like src/lib/services/sharing.ts's `stopSharingEverything`)
 * this doesn't need its own `dbWrite.transaction()` wrapper. */
export async function updateUserPreferences(userId: string, input: UpdatePreferencesInput): Promise<void> {
  await dbWrite
    .update(users)
    .set({ countReceivablesAsAsset: input.countReceivablesAsAsset, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
