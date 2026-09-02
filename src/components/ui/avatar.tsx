'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string;
  /** Nama lengkap — dipakai untuk inisial fallback dan `alt`. */
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 36, className }: AvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <AvatarPrimitive.Root
      className={cn(
        'bg-brand-subtle inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      <AvatarPrimitive.Fallback
        // text-brand-readable, bukan text-brand mentah — sama seperti Chip
        // terpilih, lihat globals.css.
        className="text-brand-readable flex size-full items-center justify-center text-sm font-semibold"
        delayMs={src ? 400 : 0}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
