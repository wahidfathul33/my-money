/**
 * Settings reads — `dbRead` only. Extended by tasks/22-settings-sharing-pwa
 * beyond task 18's single `count_receivables_as_asset` reader to cover the
 * rest of `/settings`: profile (name/email, read-only), preferences
 * (timezone, default wallet), and the wallet picker's own option list.
 */
import { and, asc, eq } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { users } from '@/lib/db/schema/users';
import { wallets } from '@/lib/db/schema/wallets';
import { households, householdMembers } from '@/lib/db/schema/households';
import { ownedBy } from '@/lib/db/scoped';

export interface UserPreferences {
  countReceivablesAsAsset: boolean;
  timezone: string;
  defaultWalletId: string | null;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const [row] = await dbRead
    .select({
      countReceivablesAsAsset: users.countReceivablesAsAsset,
      timezone: users.timezone,
      defaultWalletId: users.defaultWalletId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return {
    countReceivablesAsAsset: row?.countReceivablesAsAsset ?? false,
    timezone: row?.timezone ?? 'Asia/Jakarta',
    defaultWalletId: row?.defaultWalletId ?? null,
  };
}

export interface UserProfile {
  name: string | null;
  email: string;
  image: string | null;
}

/** `/settings/profile` — name (editable), email (read-only sign-in
 * identity), avatar image (from the OAuth provider, also read-only —
 * docs/09-screen-specs.md §18 lists no avatar upload). */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await dbRead
    .select({ name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
}

/** Minimal id/name/icon option list for the default-wallet `<Select>` on
 * `/settings/preferences` — deliberately re-implemented here rather than
 * importing src/features/wallets/queries.ts's `listActiveWallets`
 * (docs/11-tech-architecture.md §3, "features/A tidak boleh mengimpor dari
 * features/B"), same reasoning as src/features/sharing/queries.ts's own
 * local wallet listing. */
export async function listWalletOptions(userId: string): Promise<WalletOption[]> {
  return dbRead
    .select({ id: wallets.id, name: wallets.name, icon: wallets.icon })
    .from(wallets)
    .where(and(ownedBy(wallets, userId), eq(wallets.isArchived, false)))
    .orderBy(asc(wallets.sortOrder));
}

export interface BlockingHousehold {
  id: string;
  name: string;
}

/**
 * `/settings/data` renders a dedicated blocked-state screen INSTEAD of the
 * delete button/dialog when this returns non-null — docs/12-security-and-auth.md
 * §11 / docs/09-screen-specs.md §18: "Layarnya menyebutkan household mana
 * yang menghalangi, dengan tautan langsung ke tindakan yang diperlukan —
 * bukan sekadar pesan penolakan." Same predicate `deleteAccount`
 * (src/lib/services/settings.ts) re-checks server-side before the actual
 * delete — this is the read-side twin so the PAGE already knows before the
 * user ever taps a button, not just after they hit an error.
 */
export async function getBlockingHouseholdForDeletion(userId: string): Promise<BlockingHousehold | null> {
  const [row] = await dbRead
    .select({ id: households.id, name: households.name })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.role, 'owner'),
        eq(householdMembers.status, 'active'),
        eq(households.isArchived, false),
      ),
    )
    .limit(1);
  return row ?? null;
}
