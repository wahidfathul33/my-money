'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

type Variant = 'underline' | 'segmented';

interface TabsListProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  variant?: Variant;
}

const LIST_VARIANT_CLASS: Record<Variant, string> = {
  underline: 'gap-4 border-b border-border',
  segmented: 'gap-1 rounded-input bg-surface-raised p-1',
};

export function TabsList({ variant = 'underline', className, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-variant={variant}
      className={cn('flex', LIST_VARIANT_CLASS[variant], className)}
      {...props}
    />
  );
}

interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  variant?: Variant;
}

// `text-brand-readable` (globals.css) BUKAN utility Tailwind, jadi tidak
// bisa ditulis `data-[state=active]:text-brand-readable` (Tailwind hanya
// tahu meng-compile varian di atas utility yang dikenalinya). Warna aktif
// diterapkan lewat selector atribut langsung di CSS
// (`.tabs-trigger-underline[data-state='active']`) — kelasnya sendiri
// selalu terpasang, tidak kondisional.
const TRIGGER_VARIANT_CLASS: Record<Variant, string> = {
  underline:
    'tabs-trigger-underline border-b-2 border-transparent px-1 pb-2 text-text-muted data-[state=active]:border-brand',
  segmented:
    'rounded-inner text-text-muted data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-raised',
};

export function TabsTrigger({ variant = 'underline', className, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'flex h-11 flex-1 items-center justify-center text-sm font-medium transition-colors',
        'focus-visible:outline-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        TRIGGER_VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  );
}
