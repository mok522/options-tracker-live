'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trades as tradesTable, settings } from '@/db/schema';

const RAW_LEGS_KEY = 'raw_legs';

// Wipe all imported data: realized/open trades + the persisted raw-leg store.
// Lets the user recover from stale leg data (e.g. legs written by an older
// import format) and re-import cleanly. Triggered by the user from the UI.
export async function clearAllData(): Promise<void> {
  await db.delete(tradesTable);
  await db.delete(settings).where(eq(settings.key, RAW_LEGS_KEY));
  revalidatePath('/');
}
