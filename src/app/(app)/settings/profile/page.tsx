import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireUser } from '@/lib/auth/require-user';
import { getUserProfile } from '@/features/settings/queries';
import { ProfileForm } from '@/features/settings/components/profile-form';

/** `/settings/profile` — docs/09-screen-specs.md §18: "Profil (nama, email, avatar)". */
export default async function ProfileSettingsPage() {
  const user = await requireUser();
  const profile = await getUserProfile(user.id);
  if (!profile) notFound();

  return (
    <>
      <PageHeader title="Profil" />
      <div className="px-page-x pb-8">
        <div className="bg-surface rounded-card p-4">
          <ProfileForm profile={profile} />
        </div>
      </div>
    </>
  );
}
