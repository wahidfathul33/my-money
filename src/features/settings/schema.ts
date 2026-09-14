import { z } from 'zod';

export const updatePreferencesSchema = z.object({
  countReceivablesAsAsset: z.boolean(),
});

export type UpdatePreferencesActionInput = z.infer<typeof updatePreferencesSchema>;
