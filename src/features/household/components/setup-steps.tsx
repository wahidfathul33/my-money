import { Check } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface SetupStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  /** `undefined` => not clickable yet ("Segera hadir") — steps 2 and 3
   * light up in tasks 11 and 12 respectively. */
  href?: string;
  cta?: string;
}

interface SetupStepsProps {
  householdName: string;
  steps: SetupStep[];
}

/**
 * docs/10-ux-states.md §2.1 — the empty state for a brand-new household:
 * NOT a one-line "nothing here yet", but a progressed step list, because a
 * household is "technically empty" (no tagged transactions, maybe no other
 * members) right after creation and a bare empty state would read as
 * broken. Whole block disappears once every step is done — "Blok hilang
 * setelah ketiganya tuntas".
 *
 * `steps` is the 3 ACTIONABLE steps only (Undang anggota · Tandai
 * pengeluaran · Bagikan) — "Buat keluarga" is rendered as its own always-
 * checked line below, matching the mock's "✓ Buat keluarga" +
 * "Selesaikan 3 langkah berikut" (the "3" doesn't include creation itself,
 * which is already satisfied by the time this page can render at all).
 */
export function SetupSteps({ householdName, steps }: SetupStepsProps) {
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card variant="raised" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-heading text-text font-semibold">{householdName} siap digunakan</p>
        <p className="text-text-muted text-sm">Selesaikan {steps.length} langkah berikut</p>
      </div>

      <Progress value={doneCount} max={steps.length} label="Progres setup keluarga" />

      <ul className="flex flex-col gap-4">
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="border-brand bg-brand-hover text-on-brand mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border"
          >
            <Check className="size-4" />
          </span>
          <p className="text-text-muted mt-0.5 text-sm font-medium line-through">Buat keluarga</p>
        </li>
        {steps.map((step) => (
          <li key={step.key} className="flex gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border',
                step.done
                  ? 'border-brand bg-brand-hover text-on-brand'
                  : 'border-border text-text-subtle',
              )}
            >
              {step.done && <Check className="size-4" />}
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <p
                className={cn(
                  'text-sm font-medium',
                  step.done ? 'text-text-muted line-through' : 'text-text',
                )}
              >
                {step.title}
              </p>
              {!step.done && <p className="text-text-muted text-sm">{step.description}</p>}
              {!step.done && step.href && (
                <Link href={step.href} className="text-brand-readable text-sm font-medium">
                  {step.cta} →
                </Link>
              )}
              {!step.done && !step.href && (
                <span className="text-text-muted text-sm">Segera hadir</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
