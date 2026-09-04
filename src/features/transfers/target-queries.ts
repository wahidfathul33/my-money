/**
 * "Pick a member, then pick their wallet" data for the Add Transaction
 * sheet's "Ke anggota keluarga" tab — docs/09-screen-specs.md §2, spec.md's
 * "Pemilih Tujuan". `dbRead` only (docs/11-tech-architecture.md §2).
 *
 * Composes two already-canonical reads rather than inventing a third
 * cross-user query:
 *   - `listActiveMembers` (src/features/household/queries.ts) — WHO the
 *     caller may pick from, INCLUDING someone with zero eligible wallets.
 *     The person still needs to be pickable so spec.md's "Empty state bila
 *     anggota belum punya rekening yang dapat dituju" has something to show
 *     once they're selected.
 *   - `listTransferTargets` (src/lib/visibility/transfer-targets.ts,
 *     docs/12-security-and-auth.md §4.3) — WHICH of their wallets are
 *     eligible destinations. Never touches `wallets.balance` — see that
 *     module's own header; `TransferTargetDto` has no such field at all.
 */
import { listActiveMembers, listUserHouseholds } from '@/features/household/queries';
import { listTransferTargets, type TransferTargetDto } from '@/lib/visibility/transfer-targets';

export interface TransferTargetMember {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  /** Possibly empty — spec.md's "Penerima tanpa dompet layak" empty state. */
  wallets: TransferTargetDto[];
}

export interface MemberTransferHousehold {
  householdId: string;
  householdName: string;
  /** Every OTHER active member — never includes the caller themselves. */
  members: TransferTargetMember[];
}

/**
 * Every household the caller is an active member of, each with every OTHER
 * active member and their eligible destination wallets. A household with no
 * other active member yet is still included (with `members: []`) — the UI
 * decides what "nobody to pick" looks like, this just reports it faithfully.
 */
export async function listMemberTransferHouseholds(userId: string): Promise<MemberTransferHousehold[]> {
  const households = await listUserHouseholds(userId);
  if (households.length === 0) return [];

  return Promise.all(
    households.map(async (household) => {
      const [members, targets] = await Promise.all([
        listActiveMembers(household.id),
        listTransferTargets(userId, household.id),
      ]);

      const walletsByOwner = new Map<string, TransferTargetDto[]>();
      for (const target of targets) {
        const list = walletsByOwner.get(target.userId) ?? [];
        list.push(target);
        walletsByOwner.set(target.userId, list);
      }

      const otherMembers: TransferTargetMember[] = members
        .filter((member) => member.userId !== userId)
        .map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
          image: member.image,
          wallets: walletsByOwner.get(member.userId) ?? [],
        }));

      return { householdId: household.id, householdName: household.name, members: otherMembers };
    }),
  );
}

export interface TransferTargetPerson extends TransferTargetMember {
  /** Which household governs this relationship — required by
   * `createMemberTransfer` (src/lib/services/transfers.ts) to re-verify
   * both users' membership inside the write transaction. */
  householdId: string;
}

/**
 * Flattens `listMemberTransferHouseholds` into the single "pick a person"
 * list the picker UI actually renders — the overwhelmingly common case (one
 * household) needs no household-selection step at all, matching docs/09
 * §2's wireframe ("👤 Istri › 🏦 BRI Istri", no household picker shown).
 *
 * If the SAME person is reachable through more than one of the caller's
 * households (rare — two households sharing a member), the FIRST one found
 * wins; that person's wallets from other households aren't merged in. This
 * is a deliberate, narrow simplification for an edge case rather than a
 * multi-household merge UI nobody asked for.
 */
export async function listMemberTransferPeople(userId: string): Promise<TransferTargetPerson[]> {
  const households = await listMemberTransferHouseholds(userId);

  const seen = new Set<string>();
  const people: TransferTargetPerson[] = [];
  for (const household of households) {
    for (const member of household.members) {
      if (seen.has(member.userId)) continue;
      seen.add(member.userId);
      people.push({ ...member, householdId: household.householdId });
    }
  }
  return people;
}
