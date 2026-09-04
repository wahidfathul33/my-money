import { cn } from '@/lib/utils';
import type { HouseholdRole } from '../queries';

const ROLE_LABEL: Record<HouseholdRole, string> = {
  owner: 'Pemilik',
  member: 'Anggota',
};

/** docs/12-security-and-auth.md §2.2: exactly two roles, so this is a
 * lookup, not a color-per-permission-level system that would need updating
 * every time the role matrix changes. */
export function RoleBadge({ role, className }: { role: HouseholdRole; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-chip bg-surface-raised text-text-muted inline-flex h-6 items-center px-2 text-xs font-medium',
        role === 'owner' && 'bg-brand-subtle text-brand-readable',
        className,
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
