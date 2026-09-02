'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/utils';

interface RadioOption {
  value: string;
  label: string;
}

interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Label grup — wajib untuk pembaca layar (`aria-label` pada `Root`). */
  label: string;
  className?: string;
}

export function RadioGroup({ options, label, className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      className={cn('flex flex-col gap-1', className)}
      {...props}
    >
      {options.map((option) => (
        <div key={option.value} className="flex min-h-11 items-center gap-2.5">
          <RadioGroupPrimitive.Item
            value={option.value}
            id={`radio-${option.value}`}
            className={cn(
              'border-border bg-surface flex size-5 shrink-0 items-center justify-center rounded-full border',
              'data-[state=checked]:border-brand',
              'focus-visible:outline-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
          >
            <RadioGroupPrimitive.Indicator className="bg-brand size-2.5 rounded-full" />
          </RadioGroupPrimitive.Item>
          <label htmlFor={`radio-${option.value}`} className="text-text text-sm">
            {option.label}
          </label>
        </div>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
