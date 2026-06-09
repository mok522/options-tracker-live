import type { Trade } from '@/types/trade';

export const sampleKpis = {
  netPL:        24847.50,
  netPLpct:     18.6,
  winRate:      67.6,
  winRateDelta: 3.2,
  closedTrades: 142,
  openTrades:   11,
  avgTrade:     175.0,
  commissions:  -1284.20,
  profitFactor: 2.41,
  bestTrade:    3420,
  bestSym:      'NVDA',
  worstTrade:   -1180,
  worstSym:     'TSLA',
  grossWin:     41960,
  grossLoss:    -17112,
};

export const sampleMonthly = [
  { m: 'Jul', pl:  1850 }, { m: 'Aug', pl:  -920 }, { m: 'Sep', pl: 2410 },
  { m: 'Oct', pl:  3120 }, { m: 'Nov', pl:  1460 }, { m: 'Dec', pl: -640 },
  { m: 'Jan', pl:  2980 }, { m: 'Feb', pl:  4210 }, { m: 'Mar', pl:-1180 },
  { m: 'Apr', pl:  3640 }, { m: 'May', pl:  1990 }, { m: 'Jun', pl: 5107 },
];

export const sampleStrategies = [
  { name: 'Cash-Secured Puts', pct: 33, pl:  8200, trades: 41, varName: '--cat-1' },
  { name: 'Covered Calls',     pct: 24, pl:  5960, trades: 38, varName: '--cat-2' },
  { name: 'Vertical Spreads',  pct: 19, pl:  4720, trades: 29, varName: '--cat-3' },
  { name: 'Iron Condors',      pct: 14, pl:  3480, trades: 22, varName: '--cat-4' },
  { name: 'Long Options',      pct: 10, pl:  2487, trades: 23, varName: '--cat-5' },
];

export const sampleSymbols = [
  { sym: 'MSFT', rate: 77, n: 18 },
  { sym: 'SPX',  rate: 74, n: 26 },
  { sym: 'AAPL', rate: 71, n: 21 },
  { sym: 'SPY',  rate: 69, n: 24 },
  { sym: 'NVDA', rate: 64, n: 19 },
  { sym: 'TSLA', rate: 56, n: 16 },
];

export const sampleCumulative = [
  0, 620, 1480, 1120, 2360, 3300, 2980, 4180, 5400, 5060,
  6520, 7740, 7300, 8810, 10120, 9680, 11240, 12760, 12180, 13900,
  15380, 14820, 16700, 18420, 17240, 19880, 21560, 21020, 23140, 24847.5,
];

export const sampleTrades: Trade[] = [
  { sym: 'NVDA', strat: 'Covered Call',    side: 'Sell', qty: 1, strike: '880 C',      exp: 'Jun 20', fill: 12.40, pl:  1240, status: 'Closed'   },
  { sym: 'SPX',  strat: 'Iron Condor',     side: 'Sell', qty: 2, strike: '5200/5400',  exp: 'Jun 18', fill:  8.10, pl:   820, status: 'Open'     },
  { sym: 'AAPL', strat: 'Cash-Sec Put',    side: 'Sell', qty: 3, strike: '190 P',      exp: 'Jul 18', fill:  4.25, pl:   318, status: 'Expired'  },
  { sym: 'TSLA', strat: 'Long Call',       side: 'Buy',  qty: 5, strike: '260 C',      exp: 'Aug 15', fill:  9.80, pl:  -640, status: 'Closed'   },
  { sym: 'SPY',  strat: 'Vertical Spread', side: 'Sell', qty: 4, strike: '540/545',    exp: 'Jun 27', fill:  1.95, pl:   412, status: 'Assigned' },
  { sym: 'MSFT', strat: 'Cash-Sec Put',    side: 'Sell', qty: 2, strike: '420 P',      exp: 'Jul 11', fill:  5.60, pl:   560, status: 'Open'     },
  { sym: 'NDX',  strat: 'Iron Condor',     side: 'Sell', qty: 1, strike: '19k/19.4k', exp: 'Jun 18', fill: 14.20, pl:  1180, status: 'Closed'   },
  { sym: 'AMD',  strat: 'Long Put',        side: 'Buy',  qty: 6, strike: '160 P',      exp: 'Sep 19', fill:  6.40, pl:  -384, status: 'Open'     },
  { sym: 'QQQ',  strat: 'Covered Call',    side: 'Sell', qty: 2, strike: '485 C',      exp: 'Jun 27', fill:  3.10, pl:   620, status: 'Expired'  },
  { sym: 'RUT',  strat: 'Iron Condor',     side: 'Sell', qty: 1, strike: '2.1k/2.2k', exp: 'Jun 18', fill:  9.40, pl:   470, status: 'Closed'   },
  { sym: 'AAPL', strat: 'Vertical Spread', side: 'Sell', qty: 3, strike: '195/200',    exp: 'Jul 18', fill:  1.80, pl:  -210, status: 'Closed'   },
  { sym: 'SPY',  strat: 'Cash-Sec Put',    side: 'Sell', qty: 5, strike: '530 P',      exp: 'Jun 20', fill:  2.95, pl:   885, status: 'Assigned' },
  { sym: 'NVDA', strat: 'Cash-Sec Put',    side: 'Sell', qty: 1, strike: '820 P',      exp: 'Jul 11', fill: 11.60, pl:   340, status: 'Open'     },
  { sym: 'TSLA', strat: 'Iron Condor',     side: 'Sell', qty: 2, strike: '240/280',    exp: 'Jul 03', fill:  5.20, pl:   540, status: 'Closed'   },
];

export const sampleTax = {
  shortTerm: 16240,
  longTerm:   3120,
  s1256:      5480,
  washFlags:  2,
  estTax:     4910,
};
