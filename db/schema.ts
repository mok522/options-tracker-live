import { sqliteTable, text, real, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const rawTrades = sqliteTable('raw_trades', {
  dedupKey:   text('dedup_key').primaryKey(),
  execTime:   text('exec_time').notNull(),
  spread:     text('spread').notNull().default(''),
  side:       text('side').notNull(),
  qty:        integer('qty').notNull(),
  posEffect:  text('pos_effect').notNull().default(''),
  symbol:     text('symbol').notNull(),
  underlying: text('underlying').notNull(),
  expiration: text('expiration').notNull().default(''),
  strike:     real('strike').notNull().default(0),
  optionType: text('option_type').notNull().default(''),
  price:      real('price').notNull(),
  netPrice:   real('net_price').notNull().default(0),
  commission: real('commission').notNull().default(0),
  importedAt: text('imported_at').notNull(),
});

export const importHistory = sqliteTable('import_history', {
  id:           text('id').primaryKey(),
  fileName:     text('file_name').notNull(),
  importedAt:   text('imported_at').notNull(),
  rowCount:     integer('row_count').notNull(),
  dedupSkipped: integer('dedup_skipped').notNull(),
});

export const settings = sqliteTable('settings', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

export const trades = sqliteTable('trades', {
  id:     text('id').primaryKey(),
  sym:    text('sym').notNull(),
  strat:  text('strat').notNull(),
  side:   text('side').notNull(),
  qty:    integer('qty').notNull(),
  strike: text('strike').notNull(),
  exp:    text('exp').notNull(),
  fill:   real('fill').notNull(),
  comm:   real('comm'),
  pl:     real('pl').notNull(),
  status: text('status').notNull(),
  date:   text('date').notNull().default(''),
  assetType: text('asset_type').notNull().default('OPTION'), // 'OPTION' | 'EQUITY'
  openDate:  text('open_date').notNull().default(''),        // "YYYY-MM-DD" of the FIFO-matched opening leg
});

// Daily point-in-time P&L per open position. One row per (position, day);
// the cron job upserts so a re-run overwrites that day's row. Rows are kept
// forever, including after the position closes (spec: 2026-07-08 design).
export const positionSnapshots = sqliteTable('position_snapshots', {
  positionKey:  text('position_key').notNull(),   // lib/openAnalytics.ts positionKey()
  date:         text('date').notNull(),           // "YYYY-MM-DD" local
  mark:         real('mark').notNull(),           // per-contract mark
  unrealizedPl: real('unrealized_pl').notNull(),  // $ across the position's lots
  qty:          integer('qty').notNull(),         // contracts open at capture
  capturedAt:   text('captured_at').notNull(),    // ISO timestamp
}, (t) => [primaryKey({ columns: [t.positionKey, t.date] })]);
