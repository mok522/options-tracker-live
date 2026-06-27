import { schwabFetch } from './client';
import {
  getCachedAccountHash,
  saveAccountHash,
  getCachedAccountNumber,
  saveAccountNumber,
} from './tokenManager';

export interface ResolvedAccount {
  accountNumber: string; // plain number (for display)
  hashValue: string;     // encrypted hash (used in API paths)
}

/**
 * Schwab's per-account endpoints (/accounts/{id}/transactions) require the
 * ENCRYPTED hashValue, not the plain account number. This resolves and caches
 * both from /trader/v1/accounts/accountNumbers, which returns:
 *   [{ accountNumber: "12345678", hashValue: "A1B2C3..." }, ...]
 */
export async function resolveAccount(): Promise<ResolvedAccount> {
  const cachedHash = await getCachedAccountHash();
  const cachedNumber = await getCachedAccountNumber();
  if (cachedHash) {
    return { accountNumber: cachedNumber ?? '', hashValue: cachedHash };
  }

  const res = await schwabFetch('/trader/v1/accounts/accountNumbers');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch account numbers: ${res.status} ${text}`);
  }

  const list = (await res.json()) as Array<{ accountNumber?: string; hashValue?: string }>;
  const first = Array.isArray(list) ? list[0] : undefined;
  if (!first?.hashValue) {
    throw new Error('No account hash returned by Schwab');
  }

  const accountNumber = String(first.accountNumber ?? '');
  await saveAccountHash(first.hashValue);
  if (accountNumber) await saveAccountNumber(accountNumber);

  return { accountNumber, hashValue: first.hashValue };
}
