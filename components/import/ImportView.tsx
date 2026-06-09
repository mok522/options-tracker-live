'use client';

import { useState, useRef } from 'react';
import type { Trade } from '@/types/trade';
import { Icon } from '@/components/shared/Icon';
import { TradesTable } from '@/components/shared/TradesTable';
import { parseTradeCSV, buildSampleCSV } from '@/lib/csvParser';
import { sampleTrades } from '@/lib/sampleData';
import type { ParseResult } from '@/lib/csvParser';

interface ImportViewProps {
  onImport: (trades: Trade[]) => Promise<void>;
  lastImport?: string;
}

export function ImportView({ onImport, lastImport }: ImportViewProps) {
  const [stage, setStage] = useState<'drop' | 'review'>('drop');
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = (text: string, name: string) => {
    const result = parseTradeCSV(text);
    if (result.trades.length === 0) {
      setParseError('No trades found. Make sure this is a ThinkOrSwim Account Statement CSV exported from Monitor → Activity & Positions → Account Statement.');
      return;
    }
    setParseError(null);
    setFileName(name);
    setParsed(result);
    setStage('review');
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => ingest(String(fr.result), file.name);
    fr.readAsText(file);
  };

  const loadSample = () => ingest(buildSampleCSV(sampleTrades), 'ToS_AccountStatement_2026.csv');

  if (stage === 'drop') {
    return (
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, overflow: 'auto' }}>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px' }}>Import your account statement</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>Drop a ThinkOrSwim or Schwab CSV export. We auto-detect the columns — no manual entry, no mapping headaches.</div>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          style={{
            width: 'min(620px, 90%)', borderRadius: 14, cursor: 'pointer',
            border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border-2)'}`,
            background: drag ? 'var(--accent-wash)' : 'var(--surface)', transition: 'all .15s',
            padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--inset)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="upload" size={26} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Drag &amp; drop your CSV here</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>or click to browse — .csv up to 10MB</div>
          </div>
          <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </div>
        {parseError && (
          <div style={{ maxWidth: 460, padding: '10px 14px', borderRadius: 9, background: 'var(--neg-wash)', border: '1px solid var(--neg-soft)', color: 'var(--neg)', fontSize: 12.5, lineHeight: 1.5 }}>
            {parseError}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={loadSample}
            style={{ font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px', borderRadius: 9, background: 'var(--text-1)', color: 'var(--surface)', border: 0, fontSize: 13, fontWeight: 600 }}
          >
            <Icon name="spark" size={15} /> Load sample ThinkOrSwim statement
          </button>
          {lastImport && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Last import · {lastImport}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
          <Icon name="shield" size={13} /> Processed locally in your browser — your data never leaves this device.
        </div>
      </div>
    );
  }

  // review stage
  if (!parsed) return null;
  const map = parsed.map;
  const fieldNames = Object.keys(map);
  const matched = fieldNames.filter((f) => map[f] !== -1).length;
  const openCt = parsed.trades.filter((t) => t.status === 'Open').length;

  const step = (n: number, label: string, on: boolean, done: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
        background: done ? 'var(--pos)' : on ? 'var(--accent)' : 'var(--inset)',
        color: done || on ? '#fff' : 'var(--text-3)',
      }}>
        {done ? '✓' : n}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: on || done ? 600 : 500, color: on || done ? 'var(--text-1)' : 'var(--text-3)' }}>{label}</span>
    </div>
  );

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'auto' }}>
      {/* stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {step(1, 'Upload', false, true)}
        <div style={{ width: 28, height: 1, background: 'var(--border-2)' }} />
        {step(2, 'Map columns', true, false)}
        <div style={{ width: 28, height: 1, background: 'var(--border)' }} />
        {step(3, 'Review & import', false, false)}
        <div style={{ flex: 1 }} />
        <span className="chip" style={{ gap: 6, color: 'var(--pos)', borderColor: 'var(--pos-soft)' }}>
          <Icon name="spark" size={12} /> ThinkOrSwim Account Statement detected
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.55fr', gap: 13, flex: 1, minHeight: 0 }}>
        {/* column mapping */}
        <div className="panel" style={{ borderRadius: 9, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '13px 14px 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Column mapping</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{matched} of {fieldNames.length} fields matched · {fileName}</div>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto' }}>
            {fieldNames.map((field) => {
              const ok = map[field] !== -1;
              return (
                <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--inset)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ok ? parsed.headers[map[field]] : 'not found'}
                  </span>
                  <Icon name="chevRight" size={13} style={{ color: 'var(--text-faint)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, width: 78, textAlign: 'right' }}>{field}</span>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: ok ? 'var(--pos-wash)' : 'var(--inset)', color: ok ? 'var(--pos)' : 'var(--text-faint)',
                  }}>
                    {ok
                      ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                      : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    }
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* preview */}
        <div className="panel" style={{ borderRadius: 9, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '13px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Preview</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>First {Math.min(7, parsed.trades.length)} of {parsed.trades.length} rows</div>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <span className="chip" style={{ fontSize: 11 }}>{parsed.trades.length} trades</span>
              <span className="chip" style={{ fontSize: 11 }}>{openCt} open</span>
            </div>
          </div>
          <div style={{ padding: '8px 6px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <TradesTable rows={parsed.trades.slice(0, 7)} dense />
          </div>
        </div>
      </div>

      {/* actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text-3)' }}>
          <Icon name="shield" size={13} /> Processed locally — nothing uploaded.
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setStage('drop'); setParsed(null); }}
          style={{ font: 'inherit', cursor: 'pointer', height: 40, padding: '0 18px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, fontWeight: 600 }}
        >
          Back
        </button>
        <button
          disabled={importing}
          onClick={async () => { setImporting(true); await onImport(parsed.trades); setImporting(false); }}
          style={{ font: 'inherit', cursor: importing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 22px', borderRadius: 9, border: 0, background: 'var(--pos)', color: '#fff', fontSize: 13.5, fontWeight: 700, opacity: importing ? 0.7 : 1 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          {importing ? 'Importing…' : `Import ${parsed.trades.length} trades`}
        </button>
      </div>
    </div>
  );
}
