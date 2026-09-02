'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  id?: string;
  className?: string;
}

export function Checkbox({ label, id, className, ...props }: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <div className="flex min-h-11 items-center gap-2.5">
      <CheckboxPrimitive.Root
        id={checkboxId}
        className={cn(
          'border-border bg-surface flex size-5 shrink-0 items-center justify-center rounded-[0.375rem] border',
          'data-[state=checked]:border-brand data-[state=checked]:bg-brand',
          'focus-visible:outline-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <Check className="text-on-brand size-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={checkboxId} className="text-text text-sm">
        {label}
      </label>
    </div>
  );
}
