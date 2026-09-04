/**
 * The transfer-target visibility query — docs/12-security-and-auth.md §4.3,
 * docs/03-domain-model.md §9.3. This is the ONE place that decides which of
 * a household member's wallets a transfer may land in, per docs/12 §4's
 * rule: "Hanya ada dua bentuk pembacaan lintas-user... diimplementasikan
 * sekali di src/lib/visibility/** dan tidak pernah ditulis ulang di tempat
 * lain." (This is the third such form, added by task 13 alongside §4.1/§4.2.)
 *
 * Two call sites share the SAME eligibility condition
 * (`transferTargetConditions`) so the read path and the write-time re-check
 * can never drift apart:
 *   - `listTransferTargets` (via `dbRead`) — populates the destination
 *     picker (src/features/transfers/target-queries.ts).
 *   - `isWalletTransferEligible` (via a `TransactionClient`) — the
 *     in-transaction re-check `createMemberTransfer`
 *     (src/lib/services/transfers.ts) runs right before writing, per
 *     spec.md's boundary table: "Hanya ke dompet yang boleh dituju |
 *     Verifikasi di dalam transaction terhadap query §4.3".
 *
 * `TransferTargetDto` mirrors docs/12 §4.3's SELECT list EXACTLY (`id, name,
 * type, icon, color, user_id`) and has NO `balance` field — see
 * `__tests__/transfer-targets.test.ts`'s type-level test. A balance leak
 * through this path is a compile error, not a review miss. Never add one.
 */
import { and, eq, ne } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { householdMembers, wallets } from '@/lib/db/schema';
import type { TransactionClient } from '@/lib/db';

export type TransferTargetWalletType = 'cash' | 'bank' | 'ewallet' | 'credit_card';

/** docs/12 §4.3's exact column list — `w.id, w.name, w.type, w.icon, w.color, w.user_id`. No `balance`, ever. */
export interface TransferTargetDto {
  id: string;
  /** The wallet's owner — the counterparty this wallet belongs to. */
  userId: string;
  name: string;
  type: TransferTargetWalletType;
  icon: string;
  color: string;
}

/**
 * Pure predicate over already-known fields — unit-tested branch by branch
 * (docs/12 §4 "Coverage lib/visibility/** ditargetkan 100% cabang"),
 * independent of any DB round trip. Mirrors `transferTargetConditions`
 * below field-for-field; change one, change both.
 */
export interface TransferTargetEligibilityInput {
  /** `null` when the wallet owner has no membership row in this household at all. */
  membershipStatus: 'active' | 'pending' | 'removed' | null;
  isArchived: boolean;
  excludeFromHousehold: boolean;
  walletType: TransferTargetWalletType;
}

export function isEligibleTransferTargetWallet(input: TransferTargetEligibilityInput): boolean {
  return (
    input.membershipStatus === 'active' &&
    !input.isArchived &&
    !input.excludeFromHousehold &&
    input.walletType !== 'credit_card'
  );
}

/** The SQL mirror of the predicate above, scoped to one household — shared by both call sites so they can't drift apart. */
function transferTargetConditions(householdId: string): SQL {
  return and(
    eq(householdMembers.householdId, householdId),
    eq(householdMembers.status, 'active'),
    eq(wallets.isArchived, false),
    eq(wallets.excludeFromHousehold, false),
    ne(wallets.type, 'credit_card'),
  )!;
}

/**
 * Every eligible wallet belonging to an active member of `householdId`
 * OTHER than `callerUserId` — the "pick a person [who isn't you], then pick
 * their wallet" list docs/03 §9.3 and the Add Transaction sheet's "Ke
 * anggota keluarga" tab need. `householdId` must already be one the caller
 * belongs to — same "the guard already ran, this is a display query, not an
 * authorization boundary" convention as `listActiveMembers`
 * (src/features/household/queries.ts); the caller in practice only ever
 * sources `householdId` from `listUserHouseholds(callerUserId)`, which
 * already filters to active memberships.
 */
export async function listTransferTargets(
  callerUserId: string,
  householdId: string,
): Promise<TransferTargetDto[]> {
  return dbRead
    .select({
      id: wallets.id,
      userId: wallets.userId,
      name: wallets.name,
      type: wallets.type,
      icon: wallets.icon,
      color: wallets.color,
    })
    .from(wallets)
    .innerJoin(householdMembers, eq(householdMembers.userId, wallets.userId))
    .where(and(transferTargetConditions(householdId), ne(wallets.userId, callerUserId)));
}

/**
 * The in-transaction re-check `createMemberTransfer` runs immediately before
 * writing — spec.md's boundary table, "Verifikasi di dalam transaction
 * terhadap query §4.3". A single `false` covers every rejection spec.md
 * lists: wrong owner, archived, `exclude_from_household`, credit card, OR
 * the owner isn't an active member of `householdId` at all — the caller
 * (src/lib/services/transfers.ts) turns it into `WalletNotEligibleError`.
 */
export async function isWalletTransferEligible(
  tx: TransactionClient,
  params: { walletId: string; counterpartyUserId: string; householdId: string },
): Promise<boolean> {
  const [row] = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .innerJoin(householdMembers, eq(householdMembers.userId, wallets.userId))
    .where(
      and(
        eq(wallets.id, params.walletId),
        eq(wallets.userId, params.counterpartyUserId),
        transferTargetConditions(params.householdId),
      ),
    )
    .limit(1);

  return row !== undefined;
}
