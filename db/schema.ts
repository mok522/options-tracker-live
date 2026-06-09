import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

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
});
