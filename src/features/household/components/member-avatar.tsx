/**
 * Per-member avatar — initials + a color picked deterministically from the
 * member's `userId` (stable across renders/sessions, unlike a random pick
 * per mount). todo.md: "inisial + warna deterministic (bukan hijau/merah)"
 * — green and red are reserved for income/expense/positive/negative
 * semantics everywhere else in this app (docs/07 design tokens:
 * `--color-positive` hue 152, `--color-negative` hue 25); reusing either
 * hue range here would make a member's avatar color misread as a financial
 * signal. The curated hue list below stays well clear of both ranges (and
 * of `--color-warning`'s hue 75).
 */
const AVATAR_HUES = [195, 230, 265, 300, 330, 45] as const;

function hashToIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

interface MemberAvatarProps {
  /** Stable identity used to pick the color — the member's `userId`, NOT
   * their name (a rename must not reshuffle their color). */
  seed: string;
  name: string;
  size?: number;
  className?: string;
}

export function MemberAvatar({ seed, name, size = 36, className }: MemberAvatarProps) {
  const hue = AVATAR_HUES[hashToIndex(seed, AVATAR_HUES.length)];

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '9999px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: size * 0.4,
        fontWeight: 600,
        backgroundColor: `oklch(90% 0.06 ${hue})`,
        color: `oklch(38% 0.11 ${hue})`,
      }}
    >
      {initialsFor(name)}
    </span>
  );
}
