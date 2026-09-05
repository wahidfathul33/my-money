import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { requireUser } from '@/lib/auth/require-user';
import { listUserHouseholds } from '@/features/household/queries';

/**
 * `/household` — tasks/10-household-core spec.md: "menampilkan daftar;
 * redirect langsung bila user hanya punya satu." Reached from the nav
 * "Keluarga" entry once the user has at least one household.
 */
export default async function HouseholdListPage() {
  const user = await requireUser();
  const households = await listUserHouseholds(user.id);

  if (households.length === 1) {
    redirect(`/household/${households[0]!.id}`);
  }

  return (
    <>
      <PageHeader
        title="Keluarga"
        action={
          households.length > 0 ? (
            <Button asChild>
              <Link href="/household/new">
                <Plus className="size-4" aria-hidden="true" />
                Buat Keluarga
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="px-page-x pb-8">
        {households.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Kelola keuangan bersama"
            description="Lihat gambaran keuangan keluarga tanpa menggabungkan rekening. Dompet tetap milik masing-masing."
            action={
              <Button asChild>
                <Link href="/household/new">Buat Keluarga</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {households.map((household) => (
              <li key={household.id}>
                <Link
                  href={`/household/${household.id}`}
                  className="pressable-tint rounded-inner border-border bg-surface flex items-center justify-between border px-4 py-3"
                >
                  <span className="text-text font-medium">{household.name}</span>
                  <span className="text-text-muted text-sm">{household.memberCount} orang</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
