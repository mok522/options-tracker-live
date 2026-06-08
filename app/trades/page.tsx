import { db } from '@/db/client';
import { rawTrades } from '@/db/schema';
import { buildPositions } from '@/lib/engine/positionBuilder';
import { TradesView } from '@/components/trades/TradesView';
import type { RawTrade } from '@/types';

export default async function TradesPage() {
  const rows = await db.select().from(rawTrades);
  const positions = buildPositions(rows as unknown as RawTrade[]);
  return <TradesView positions={positions} />;
}
