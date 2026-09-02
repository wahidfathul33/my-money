'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Label wajib — dipasang lewat `aria-label` bila tidak ada `<label>` visual. */
  label: string;
  id?: string;
  className?: string;
}

export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    // Bungkus di kotak 44×44 agar target sentuh terpenuhi walau thumb
    // visualnya lebih kecil (docs/07 §9 — "tanpa kecuali").
    <span className="inline-flex size-11 items-center justify-center">
      <SwitchPrimitive.Root
        aria-label={label}
        className={cn(
          'bg-border data-[state=checked]:bg-brand relative h-6 w-11 rounded-full transition-colors',
          'focus-visible:outline-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="bg-surface shadow-raised block size-5 translate-x-0.5 rounded-full transition-transform duration-200 ease-out data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
    </span>
  );
}
