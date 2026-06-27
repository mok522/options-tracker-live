'use server';

import { revalidatePath } from 'next/cache';
import { clearTokens } from '@/lib/schwab/tokenManager';

export async function disconnectSchwab(): Promise<void> {
  await clearTokens();
  revalidatePath('/', 'layout');
}
