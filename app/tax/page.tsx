import { db } from '@/db/client';
import { rawTrades, settings } from '@/db/schema';
import { buildPositions } from '@/lib/engine/positionBuilder';
import { computeTax } from '@/lib/engine/taxEngine';
import { TaxView } from '@/components/tax/TaxView';
import type { TaxSettings, RawTrade } from '@/types';

export default async function TaxPage() {
  const [rows, settingsRows] = await Promise.all([
    db.select().from(rawTrades),
    db.select().from(settings),
  ]);
  const marginalBracketRate = parseFloat(
    settingsRows.find((s) => s.key === 'marginalBracketRate')?.value ?? '0.24'
  );
  const taxYear = parseInt(
    settingsRows.find((s) => s.key === 'taxYear')?.value ?? String(new Date().getFullYear())
  );
  const taxSettings: TaxSettings = { marginalBracketRate, taxYear };
  const positions = buildPositions(rows as unknown as RawTrade[]);
  const taxSummary = computeTax(positions, taxSettings);
  return <TaxView taxSummary={taxSummary} settings={taxSettings} />;
}
