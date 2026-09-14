/**
 * Settings reads — `dbRead` only. Minimal for the same reason
 * src/lib/services/settings.ts is: only `count_receivables_as_asset`
 * (ADR-010, task 18) has a real reader today.
 */
import { eq } from 'drizzle-orm';
import { dbRead } from '@/lib/db/read';
import { users } from '@/lib/db/schema/users';

export interface UserPreferences {
  countReceivablesAsAsset: boolean;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const [row] = await dbRead
    .select({ countReceivablesAsAsset: users.countReceivablesAsAsset })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { countReceivablesAsAsset: row?.countReceivablesAsAsset ?? false };
}
