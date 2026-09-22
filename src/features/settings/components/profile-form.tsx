'use client';

/**
 * `/settings/profile` — docs/09-screen-specs.md §18: "Profil (nama, email,
 * avatar)". Only `name` is editable — email is the sign-in identity
 * (read-only everywhere in this app) and the avatar comes from the OAuth
 * provider (no upload flow in scope, same as every other read-only field
 * here).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateProfileAction } from '../actions';
import type { UserProfile } from '../queries';

interface ProfileFormProps {
  profile: UserProfile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(profile.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = name.trim() !== (profile.name ?? '').trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfileAction({ name });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex justify-center">
        <Avatar src={profile.image ?? undefined} name={name || profile.email} size={72} />
      </div>

      <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />

      <div className="flex flex-col gap-1.5">
        <Input label="Email" value={profile.email} disabled readOnly />
        <span className="text-text-muted text-xs">Email tidak dapat diubah</span>
      </div>

      {error && (
        <p role="alert" className="text-negative text-sm">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-positive text-sm">
          Tersimpan
        </p>
      )}

      <Button type="submit" disabled={!dirty} loading={isPending}>
        Simpan
      </Button>
    </form>
  );
}
