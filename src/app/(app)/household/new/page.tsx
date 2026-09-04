import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { CreateHouseholdForm } from '@/features/household/components/create-household-form';

/**
 * `/household/new` — reachable from the "Buat keluarga" nav entry (always
 * visible, per tasks/10-household-core spec.md) and the context switcher's
 * "Buat keluarga baru" item. No membership guard needed: creating a
 * household has no household to be a member OF yet.
 */
export default async function NewHouseholdPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Buat Keluarga"
        description="Lihat gambaran keuangan keluarga tanpa menggabungkan rekening. Dompet tetap milik masing-masing."
      />
      <div className="px-page-x pb-8">
        <CreateHouseholdForm />
      </div>
    </>
  );
}
