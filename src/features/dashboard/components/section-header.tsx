/**
 * "Anggaran ... Lihat →" — the small heading + "see more" link row that
 * repeats across every dashboard section with a fuller view elsewhere
 * (docs/09-screen-specs.md §1's mockup). Server-safe: a `<Link>` needs no
 * `'use client'` boundary of its own.
 */
import Link from 'next/link';

interface SectionHeaderProps {
  title: string;
  href: string;
  linkLabel?: string;
}

export function SectionHeader({ title, href, linkLabel = 'Lihat' }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-text text-sm font-semibold">{title}</h2>
      <Link href={href} className="text-brand-readable text-sm font-medium">
        {linkLabel} →
      </Link>
    </div>
  );
}
