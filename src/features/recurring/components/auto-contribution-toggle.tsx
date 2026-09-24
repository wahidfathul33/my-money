'use client';

/**
 * "Kontribusi otomatis" toggle for the savings goal detail page —
 * tasks/24-recurring-transactions/spec.md. A binary toggle, not a full CRUD
 * UI: turning it ON opens a small sheet to configure the rule (source
 * wallet, nominal, frequency, optional end date — spec.md's exact field
 * list) and creates it with `start_date = today`; turning it OFF deletes
 * the caller's existing ACTIVE rule for this goal outright. Finer control
 * (pause/resume, or managing a rule that's currently `paused`) lives on
 * `/settings/recurring` instead — see
 * src/features/recurring/queries.ts's `getActiveRecurringContributionForGoal`
 * doc comment for why this toggle only ever reflects `active`.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Repeat } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { MoneyText } from '@/components/finance/money-text';
import { AmountKeypad } from '@/features/transactions/components/amount-keypad';
import { WalletPicker } from '@/features/transactions/components/wallet-picker';
import { evaluateExpression, formatExpression } from '@/features/transactions/amount-math';
import { deserializeMoney, serializeMoney } from '@/lib/finance/money';
import { toLocalDate } from '@/lib/date/timezone';
import type { RecurringFrequency } from '@/lib/date/recurring';
import type { WalletOption } from '@/features/transactions/sheet-data';
import { createRecurringContributionAction, deleteRecurringContributionAction } from '../actions';
import type { RecurringContributionClientData } from '../client-types';

const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
};

interface AutoContributionToggleProps {
  goalId: string;
  existingRule: RecurringContributionClientData | null;
  wallets: WalletOption[];
  defaultWalletId: string | null;
}

export function AutoContributionToggle({ goalId, existingRule, wallets, defaultWalletId }: AutoContributionToggleProps) {
  const router = useRouter();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(checked: boolean) {
    setError(null);
    if (checked) {
      setFormOpen(true);
      return;
    }
    if (!existingRule) return;
    startTransition(async () => {
      const result = await deleteRecurringContributionAction(existingRule.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      toast.show({ title: 'Kontribusi otomatis dinonaktifkan', variant: 'success' });
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Repeat className="text-text-muted size-4 shrink-0" aria-hidden="true" />
        <span className="text-text flex-1 text-sm font-medium">Kontribusi otomatis</span>
        <Switch
          label="Kontribusi otomatis"
          checked={existingRule !== null}
          disabled={isPending}
          onCheckedChange={handleToggle}
        />
      </div>
      {existingRule && (
        <p className="text-text-muted pl-6 text-xs">
          <MoneyText amount={deserializeMoney(existingRule.amount)} tone="plain" size="sm" /> setiap{' '}
          {FREQUENCY_LABEL[existingRule.frequency].toLowerCase()} dari {existingRule.walletName}
        </p>
      )}
      {error && (
        <p role="alert" className="text-negative pl-6 text-xs">
          {error}
        </p>
      )}

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent variant="bottom" title="Kontribusi otomatis">
          {formOpen && (
            <AutoContributionForm
              goalId={goalId}
              wallets={wallets}
              defaultWalletId={defaultWalletId}
              onDone={() => {
                setFormOpen(false);
                router.refresh();
                toast.show({ title: 'Kontribusi otomatis diaktifkan', variant: 'success' });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface AutoContributionFormProps {
  goalId: string;
  wallets: WalletOption[];
  defaultWalletId: string | null;
  onDone: () => void;
}

function AutoContributionForm({ goalId, wallets, defaultWalletId, onDone }: AutoContributionFormProps) {
  const [walletId, setWalletId] = useState<string>(defaultWalletId ?? wallets[0]?.id ?? '');
  const [expression, setExpression] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amount = evaluateExpression(expression);
  const saveDisabled = amount <= 0n || walletId === '' || isPending;

  function handleSave() {
    if (saveDisabled) return;
    setError(null);
    startTransition(async () => {
      const result = await createRecurringContributionAction({
        goalId,
        walletId,
        amount: serializeMoney(amount),
        frequency,
        startDate: toLocalDate(new Date()),
        endDate: endDate || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} triggerLabel="Dompet sumber" />

      <Tabs value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequency)}>
        <TabsList variant="segmented" className="w-full">
          <TabsTrigger variant="segmented" value="daily">
            Harian
          </TabsTrigger>
          <TabsTrigger variant="segmented" value="weekly">
            Mingguan
          </TabsTrigger>
          <TabsTrigger variant="segmented" value="monthly">
            Bulanan
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <label className="text-text flex h-11 items-center gap-2 text-sm font-medium">
        Berakhir (opsional)
        <input
          type="date"
          aria-label="Tanggal berakhir (opsional)"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-input border-border bg-surface text-body text-text h-11 flex-1 border px-3"
        />
      </label>

      <p role="status" aria-label="Jumlah" className="font-money text-hero text-text py-2 text-center">
        {formatExpression(expression)}
      </p>

      {error && (
        <p role="alert" className="text-negative text-center text-sm">
          {error}
        </p>
      )}

      <AmountKeypad
        expression={expression}
        onExpressionChange={setExpression}
        onSave={handleSave}
        saveDisabled={saveDisabled}
        saving={isPending}
      />
    </div>
  );
}
