'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label: string;
  hideLabel?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Dibangun di atas Radix Select. Di bawah `sm` (mobile), konten dipaksa
 * jadi bottom sheet lewat CSS saja (`.select-content` di globals.css) —
 * tidak ada deteksi lebar layar di JS, tidak ada dua implementasi.
 */
export function Select({
  options,
  label,
  hideLabel = false,
  placeholder = 'Pilih…',
  className,
  ...props
}: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <SelectPrimitive.Root {...props}>
        <span
          id={`${label}-label`}
          className={cn('text-text text-sm font-medium', hideLabel && 'sr-only')}
        >
          {label}
        </span>
        <SelectPrimitive.Trigger
          aria-labelledby={`${label}-label`}
          className={cn(
            'rounded-input border-border bg-surface text-body text-text flex h-11 items-center justify-between gap-2 border px-3',
            'focus-visible:outline-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            // text-muted, bukan text-subtle — ini teks nyata (bukan atribut
            // placeholder native), jadi tetap wajib >=4.5:1 (WCAG 1.4.3).
            'data-[placeholder]:text-text-muted',
            className,
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="text-text-muted size-4" aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="select-content rounded-card border-border bg-surface shadow-float z-50 overflow-hidden border"
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    'rounded-inner text-body text-text relative flex h-11 cursor-pointer items-center px-8 outline-none',
                    'data-[highlighted]:bg-surface-raised',
                  )}
                >
                  <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
                    <Check className="text-brand size-4" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
