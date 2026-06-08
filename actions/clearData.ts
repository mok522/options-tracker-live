'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { rawTrades, importHistory } from '@/db/schema';

export async function clearAllData(): Promise<void> {
  await db.delete(rawTrades);
  await db.delete(importHistory);
  revalidatePath('/', 'layout');
}
