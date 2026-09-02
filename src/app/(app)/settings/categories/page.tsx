import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { listCategories } from '@/features/categories/queries';
import { CategoriesTabs } from './categories-tabs';

/**
 * `/settings/categories` — tasks/06-categories/spec.md. Server Component:
 * fetches both types up front (small, per-user lists — no pagination
 * needed) and hands them to the client tab switcher, so switching tabs is
 * instant instead of a refetch.
 */
export default async function CategoriesSettingsPage() {
  const user = await requireUser();

  const [expense, income] = await Promise.all([
    listCategories(user.id, 'expense', { includeArchived: true }),
    listCategories(user.id, 'income', { includeArchived: true }),
  ]);

  return (
    <>
      <PageHeader title="Kategori" description="Kelola kategori pengeluaran dan pemasukan Anda." />
      <div className="px-page-x pb-8">
        <CategoriesTabs expense={expense} income={income} />
      </div>
    </>
  );
}
