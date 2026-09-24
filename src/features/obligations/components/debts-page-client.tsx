'use client';

/**
 * `/wealth/debts` — Hutang | Piutang tabs (search param, docs/02-information-architecture.md
 * §6: "Tab hutang/piutang | Search param (`?tab=debts`) | Kembali ke tab
 * yang sama saat back"), each with three sections in a fixed order
 * (todo.md): "Jatuh tempo segera" (due within 7 days OR already overdue —
 * same window src/features/obligations/queries.ts's `getUpcomingDue` uses
 * for the dashboard card), then "Aktif", then "Selesai" (`paid` +
 * `written_off` together — both are equally "nothing left to do" from the
 * list's point of view). Overdue items sort first within "Jatuh tempo
 * segera" (docs/09-screen-specs.md §7: "Yang telat bayar tampil paling
 * atas").
 *
 * `router.replace` (not `push`) for the tab switch — same reasoning
 * src/features/transactions/use-history-filters.ts documents for its own
 * filter updates: switching tabs shouldn't take an extra back-button press
 * to undo.
 *
 * Every unpaid row gets an explicit "Catat Bayar" button regardless of
 * which section it's in — a deliberate, slightly broader choice than
 * docs/09-screen-specs.md §7's wireframe (which only draws the button on
 * the urgent card): the edit sheet a row's own tap target opens has no
 * payment entry point of its own, so every actionable row needs SOME
 * always-visible way to record a payment.
 */
import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HandCoins, Loader2, Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MoneyText } from '@/components/finance/money-text';
import { deserializeMoney } from '@/lib/finance/money';
import type { WalletOption } from '@/features/transactions/sheet-data';
import type { ObligationListItemClientData } from '../client-types';
import type { CounterpartyCandidate } from '../queries';
import { ObligationRow } from './obligation-row';
import { ObligationFormSheet } from './obligation-form-sheet';
import { RecordPaymentSheet } from './record-payment-sheet';

const DUE_SOON_DAYS = 7;

/** Same day-overflow-normalizing `Date.UTC` technique as
 * src/features/obligations/queries.ts's private `addDaysToDateStr` —
 * duplicated here since this runs client-side against already-serialized
 * props, not against the query layer. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

interface Sections {
  urgent: ObligationListItemClientData[];
  active: ObligationListItemClientData[];
  done: ObligationListItemClientData[];
}

function partition(items: ObligationListItemClientData[], today: string): Sections {
  const windowEnd = addDaysToDateStr(today, DUE_SOON_DAYS);
  const sections: Sections = { urgent: [], active: [], done: [] };

  for (const item of items) {
    if (item.status === 'paid' || item.status === 'written_off') {
      sections.done.push(item);
    } else if (item.overdue || (item.dueDate !== null && item.dueDate <= windowEnd)) {
      sections.urgent.push(item);
    } else {
      sections.active.push(item);
    }
  }

  sections.urgent.sort((a, b) => Number(b.overdue) - Number(a.overdue));
  return sections;
}

interface ObligationListProps {
  items: ObligationListItemClientData[];
  emptyTitle: string;
  /** Omitted for "Tidak ada hutang" — docs/08-copywriting.md §5.5: that
   * state needs no description, celebrating it would read as a template. */
  emptyDescription?: string;
  today: string;
  onCreate: () => void;
  onEdit: (item: ObligationListItemClientData) => void;
  onPay: (item: ObligationListItemClientData) => void;
}

function ObligationList({ items, emptyTitle, emptyDescription, today, onCreate, onEdit, onPay }: ObligationListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title={emptyTitle}
        description={emptyDescription}
        action={
          <Button onClick={onCreate}>
            <Plus className="size-4" aria-hidden="true" />
            Tambah catatan
          </Button>
        }
      />
    );
  }

  const sections = partition(items, today);
  const sectionList: [string, ObligationListItemClientData[]][] = [
    ['Jatuh tempo segera', sections.urgent],
    ['Aktif', sections.active],
    ['Selesai', sections.done],
  ];

  return (
    <div className="flex flex-col gap-6">
      {sectionList.map(
        ([title, list]) =>
          list.length > 0 && (
            <div key={title} className="flex flex-col gap-2">
              <h2 className="text-text-muted px-1 text-sm font-medium">{title}</h2>
              <div className="flex flex-col gap-2">
                {list.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2">
                    <ObligationRow item={item} today={today} onClick={() => onEdit(item)} />
                    {item.status !== 'paid' && item.status !== 'written_off' && (
                      <Button variant="secondary" size="sm" className="self-end" onClick={() => onPay(item)}>
                        Catat Bayar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
}

interface DebtsPageClientProps {
  debts: ObligationListItemClientData[];
  receivables: ObligationListItemClientData[];
  totalDebt: string;
  totalReceivable: string;
  /** `YYYY-MM-DD`, resolved server-side in the household's timezone — see
   * src/features/obligations/queries.ts's file header. */
  today: string;
  wallets: WalletOption[];
  defaultWalletId: string | null;
  counterpartyCandidates: CounterpartyCandidate[];
}

export function DebtsPageClient({
  debts,
  receivables,
  totalDebt,
  totalReceivable,
  today,
  wallets,
  defaultWalletId,
  counterpartyCandidates,
}: DebtsPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'receivables' ? 'receivables' : 'debts';
  const [isTabPending, startTabTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ObligationListItemClientData | null>(null);
  const [paying, setPaying] = useState<ObligationListItemClientData | null>(null);

  function setTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    // startTransition + isTabPending below: this re-renders the page from
    // the server (debts/receivables + totals are both server-fetched), so
    // without feedback here the tap looks ignored until the content
    // suddenly swaps underneath the user.
    startTabTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const createKind: 'debt' | 'receivable' = tab === 'receivables' ? 'receivable' : 'debt';

  return (
    <div className="px-page-x flex flex-col gap-4 pb-8">
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <TabsList variant="segmented" className="flex-1" aria-busy={isTabPending || undefined}>
            <TabsTrigger variant="segmented" value="debts" className="flex-1" disabled={isTabPending}>
              Hutang
            </TabsTrigger>
            <TabsTrigger variant="segmented" value="receivables" className="flex-1" disabled={isTabPending}>
              Piutang
            </TabsTrigger>
          </TabsList>
          {isTabPending && (
            <Loader2 className="text-text-muted size-4 shrink-0 animate-spin" aria-hidden="true" />
          )}
          <Button onClick={() => setCreateOpen(true)} aria-label={`Tambah ${createKind === 'debt' ? 'hutang' : 'piutang'}`}>
            <Plus className="size-4" aria-hidden="true" />
            Tambah
          </Button>
        </div>

        <TabsContent value="debts" className="flex flex-col gap-4">
          {debts.length > 0 && (
            <div className="bg-surface-raised rounded-card p-4">
              <p className="text-text-muted text-sm">Total hutang</p>
              <MoneyText amount={deserializeMoney(totalDebt)} tone="plain" size="lg" />
            </div>
          )}
          <ObligationList
            items={debts}
            emptyTitle="Tidak ada hutang"
            today={today}
            onCreate={() => setCreateOpen(true)}
            onEdit={setEditing}
            onPay={setPaying}
          />
        </TabsContent>

        <TabsContent value="receivables" className="flex flex-col gap-4">
          {receivables.length > 0 && (
            <div className="bg-surface-raised rounded-card p-4">
              <p className="text-text-muted text-sm">Total piutang</p>
              <MoneyText amount={deserializeMoney(totalReceivable)} tone="plain" size="lg" />
            </div>
          )}
          {/* No description, matching docs/08-copywriting.md §5.5's "Hutang"
              row exactly ("tanpa deskripsi ... keadaan itu tidak butuh
              dorongan apa pun") — the same reasoning generalizes to having
              no receivables, and the table has no separate Piutang row. */}
          <ObligationList
            items={receivables}
            emptyTitle="Tidak ada piutang"
            today={today}
            onCreate={() => setCreateOpen(true)}
            onEdit={setEditing}
            onPay={setPaying}
          />
        </TabsContent>
      </Tabs>

      <ObligationFormSheet
        kind={createKind}
        open={createOpen}
        onOpenChange={setCreateOpen}
        counterpartyCandidates={counterpartyCandidates}
        wallets={wallets}
      />

      {editing && (
        <ObligationFormSheet
          key={editing.id}
          kind={editing.kind}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          obligation={editing}
          counterpartyCandidates={counterpartyCandidates}
          wallets={wallets}
          onWrittenOff={() => setEditing(null)}
        />
      )}

      {paying && (
        <RecordPaymentSheet
          key={paying.id}
          open
          onOpenChange={(open) => !open && setPaying(null)}
          kind={paying.kind}
          obligationId={paying.id}
          name={paying.name}
          remainingAmount={paying.remainingAmount}
          wallets={wallets}
          defaultWalletId={defaultWalletId}
        />
      )}
    </div>
  );
}
