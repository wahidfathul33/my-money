import { cn } from '@/lib/utils';

/** `household_net_worth_snapshots`/`GET /api/households/[id]/net-worth`'s
 * own `coverage` shape — docs/06-api-contracts.md §6. */
export interface CoverageInfo {
  /** Every ACTIVE member, sharing or not. */
  memberCount: number;
  /** The subset with `share_wealth = true` — the only members folded into
   * the total this note sits next to. */
  contributingCount: number;
}

interface CoverageNoteProps {
  /**
   * NOT optional, and deliberately has no default — tasks/19-net-worth/spec.md:
   * "`CoverageNote` bersifat prop non-opsional pada komponen total —
   * merender angkanya tanpa cakupan menghasilkan error TypeScript." A
   * household total is, by construction, incomplete (docs/05-financial-integrity.md
   * §9: "Kekayaan keluarga — Tidak lengkap menurut konstruksi"), so a caller
   * MUST know and pass the coverage before this component (or anything
   * that embeds it, e.g. `HouseholdNetWorthTotal`) will even compile.
   */
  coverage: CoverageInfo;
  className?: string;
}

/**
 * "Total (2 dari 3 anggota)" — docs/09-screen-specs.md §16's exact copy.
 * Always renders, regardless of whether every member shares (a household
 * where everyone shares still states "3 dari 3 anggota" — coverage is
 * stated, not hidden once "complete").
 */
export function CoverageNote({ coverage, className }: CoverageNoteProps) {
  return (
    <span className={cn('text-text-muted text-sm', className)}>
      {coverage.contributingCount} dari {coverage.memberCount} anggota
    </span>
  );
}
