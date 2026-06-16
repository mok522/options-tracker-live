export interface Trade {
  id?: string;
  sym: string;
  strat: string;
  side: 'Buy' | 'Sell';
  qty: number;
  strike: string;
  exp: string;
  fill: number;
  optType?: string; // 'CALL' | 'PUT' | '' — drives structural strategy naming
  comm?: number | null;
  pl: number;
  status: 'Open' | 'Closed' | 'Expired' | 'Assigned';
  date?: string; // ISO "YYYY-MM-DD" — execution date for opens, realization date for closes
}
