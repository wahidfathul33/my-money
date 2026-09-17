import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

/**
 * Replaces the delete-account button entirely on `/settings/data` while the
 * caller is still `owner` of an active household — docs/12-security-and-auth.md
 * §11 / docs/09-screen-specs.md §18: "Layarnya menyebutkan household mana
 * yang menghalangi, dengan tautan langsung ke tindakan yang diperlukan —
 * bukan sekadar pesan penolakan." Named household, direct link to
 * `/household/{id}/settings` (transfer ownership or archive) — the same
 * two actions `deleteAccount`'s service-layer guard is itself satisfied by.
 */
export function OwnerBlockedDeletionCard({ householdId, householdName }: { householdId: string; householdName: string }) {
  return (
    <div className="bg-surface rounded-card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="text-negative mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-text text-sm font-medium">Akun belum bisa dihapus</p>
          <p className="text-text-muted text-sm">
            Anda masih pemilik <span className="text-text font-medium">{householdName}</span>. Alihkan
            kepemilikan ke anggota lain atau arsipkan keluarga ini terlebih dahulu.
          </p>
        </div>
      </div>
      <Link
        href={`/household/${householdId}/settings`}
        className="text-brand-readable text-sm font-medium"
      >
        Buka pengaturan {householdName}
      </Link>
    </div>
  );
}
