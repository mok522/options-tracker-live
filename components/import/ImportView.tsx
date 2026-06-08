'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DropZone } from './DropZone';
import { PreviewTable } from './PreviewTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { parseTOS } from '@/lib/parser/tosParser';
import { importTrades } from '@/actions/importTrades';
import type { RawTrade } from '@/types';

// ---------------------------------------------------------------------------
// Sample data for the "Load sample data" button
// ---------------------------------------------------------------------------
const SAMPLE_CSV = `Account Statement for Demo-12345,,,,,,,,,,,
,,,,,,,,,,,
Account Trade History
,,,,,,,,,,,
"Exec Time","Spread","Side","Qty","Pos Effect","Symbol","Exp","Strike","Type","Price","Net Price","Order Type"
"01/15/25 09:30","SINGLE","SELL","1","TO OPEN","AAPL","01/17/25","230","CALL","3.50","3.49","LMT"
"01/17/25 15:45","SINGLE","BUY","1","TO CLOSE","AAPL","01/17/25","230","CALL","1.20","1.21","MKT"
"01/20/25 10:00","VERTICAL","SELL","2","TO OPEN","SPX","01/31/25","5900","PUT","8.50","8.49","LMT"
"01/20/25 10:00","VERTICAL","BUY","2","TO OPEN","SPX","01/31/25","5850","PUT","5.00","5.01","LMT"
"01/31/25 16:00","VERTICAL","BUY","2","TO CLOSE","SPX","01/31/25","5900","PUT","2.00","2.01","MKT"
"01/31/25 16:00","VERTICAL","SELL","2","TO CLOSE","SPX","01/31/25","5850","PUT","0.50","0.49","MKT"
"02/03/25 09:45","SINGLE","BUY","3","TO OPEN","NVDA","02/21/25","135","CALL","4.20","4.21","LMT"
,,,,,,,,,,,
`;

// ---------------------------------------------------------------------------
// Column mapping summary items
// ---------------------------------------------------------------------------
const DETECTED_FIELDS = [
  'Exec Time',
  'Symbol',
  'Side',
  'Strategy',
  'Price',
  'Net Price',
];

type Stage = 'drop' | 'review';

export function ImportView() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [stage, setStage] = useState<Stage>('drop');
  const [trades, setTrades] = useState<RawTrade[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  function handleFile(csvText: string, name: string) {
    const result = parseTOS(csvText);
    setTrades(result.trades);
    setWarnings(result.warnings);
    setFileName(name);
    setImportError(null);
    setImportSuccess(false);
    setStage('review');
  }

  function handleSampleData() {
    handleFile(SAMPLE_CSV, 'sample-data.csv');
  }

  function handleBack() {
    setStage('drop');
    setTrades([]);
    setWarnings([]);
    setFileName('');
    setImportError(null);
    setImportSuccess(false);
  }

  function handleImport() {
    setImportError(null);
    startTransition(async () => {
      try {
        await importTrades(trades, fileName);
        setImportSuccess(true);
        // Brief pause so the user sees the success message
        await new Promise((resolve) => setTimeout(resolve, 800));
        router.push('/dashboard');
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : 'Import failed. Please try again.'
        );
      }
    });
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  if (stage === 'drop') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground">
          Import ThinkOrSwim Statement
        </h1>
        <p className="mb-8 text-base text-muted-foreground">
          Drag and drop your TOS account statement CSV, or click to browse.
        </p>

        <DropZone onFile={handleFile} />

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-6 flex justify-center">
          <Button variant="outline" size="sm" onClick={handleSampleData}>
            Load sample data
          </Button>
        </div>
      </div>
    );
  }

  // Review stage
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Upload</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-semibold text-foreground underline underline-offset-4">
          Review
        </span>
        <span className="text-muted-foreground">→</span>
        <span className="text-muted-foreground">Import</span>
      </div>

      {/* Format detection badge */}
      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-xl font-semibold text-foreground">
          Review Import
        </h2>
        <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">
          ThinkOrSwim format detected ✓
        </Badge>
      </div>

      {/* Two-column layout */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        {/* Left: Column mapping */}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Detected columns
          </h3>
          <ul className="space-y-1.5">
            {DETECTED_FIELDS.map((field) => (
              <li key={field} className="flex items-center gap-2 text-sm">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span className="text-foreground">{field}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: Preview table */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Preview (first 7 rows)
          </h3>
          <PreviewTable trades={trades} maxRows={7} />
        </div>
      </div>

      {/* Summary */}
      <div className="mb-4 rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium text-foreground">
          {trades.length} trade{trades.length !== 1 ? 's' : ''} found
          {fileName ? ` in "${fileName}"` : ''}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Previously imported duplicates will be skipped automatically.
        </p>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
          <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            {warnings.length} warning{warnings.length !== 1 ? 's' : ''} from parsing
          </p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Import error */}
      {importError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {importError}
        </div>
      )}

      {/* Success message */}
      {importSuccess && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-400">
          Import successful! Redirecting to dashboard...
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleBack} disabled={isPending}>
          ← Back
        </Button>
        <Button
          onClick={handleImport}
          disabled={isPending || trades.length === 0 || importSuccess}
          className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          {isPending ? 'Importing…' : `Import ${trades.length} trade${trades.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
}
