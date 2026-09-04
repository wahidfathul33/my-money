import Link from 'next/link';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

/**
 * Rendered when `notFound()` fires inside this segment — either
 * `layout.tsx`'s guard (not a member — or the household plain doesn't
 * exist; deliberately indistinguishable, docs/12-security-and-auth.md §3
 * "H2") or a real 404 within a nested page. docs/10-ux-states.md §1: "Bukan
 * anggota (404)" is the "Ringkasan keluarga" row's documented error state.
 */
export default function HouseholdNotFound() {
  return (
    <EmptyState
      icon={Users}
      title="Keluarga tidak ditemukan"
      description="Keluarga ini tidak ada, atau Anda bukan anggotanya."
      action={
        <Button asChild>
          <Link href="/household">Kembali ke daftar keluarga</Link>
        </Button>
      }
      className="mx-auto"
    />
  );
}
