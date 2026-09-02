import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Ikon 48px + judul + deskripsi + satu CTA (docs/07 §14.1). */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <div className="bg-surface-raised text-text-subtle flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-heading text-text font-semibold">{title}</p>
        {description && <p className="text-text-muted max-w-xs text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
