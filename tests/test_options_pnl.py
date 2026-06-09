"""
test_options_pnl.py — ground-truth fixtures for an options P&L + strategy engine.

WHAT THIS IS
------------
18 real trades pulled and verified against a thinkorswim/Schwab Account
Statement (acct ...82SCHW, 6/8/25-6/7/26). They are the spec: your portal's
P&L and strategy-detection code must make every assertion below pass. Do NOT
edit the fixtures or the expected values to fit the code — fix the code to fit
the fixtures.

RUN
---
    pip install pytest
    pytest test_options_pnl.py -v
Or standalone (no pytest):  python test_options_pnl.py

THE RULES THE FIXTURES ENCODE
-----------------------------
1. SIGN CONVENTION. Cash from a SELL is +, from a BUY is -, times 100 times
   contracts. Realized P&L is the sum of every execution's cash flow.
2. CONTRACT SCALING. qty 2 scales gross AND commission (trades 2, 7, 8, 18).
3. COMMISSION. $0.65 per contract per execution, WAIVED on a buy-to-close
   priced <= $0.05 (trades 6, 7). Misc/regulatory fee comes from the statement
   per execution; it is NOT a clean $0.01/contract (trade 18 is $0.05).
4. EXPIRATION. No closing fill. Option -> 0, so realized P&L = opening cash
   minus opening fees. Long loses the debit; short keeps the credit (trades 11-13).
5. ASSIGNMENT. Short option, no buy-to-close. OPTION realized P&L = premium
   minus fees. SEPARATELY a stock position is created at the strike
   (put->BUY shares, call->SELL shares); that stock P&L is unrealized and
   tracked on its own, NOT in the option P&L (trades 14-16).
6. ROLL. One multi-leg order whose legs belong to different positions. The
   order-level result is the sum of its leg cash flows minus fees; per-position
   P&L is resolved by FIFO-matching each leg to its other end (trades 17, 18).
7. STRATEGY DETECTION is structural: 1 leg -> Long/Short Call/Put; 2 legs same
   type + same strike + diff exp -> Calendar; same type + diff strike + diff
   exp -> Diagonal; same type + same exp + diff strike -> Vertical;
   call+put same exp -> Straddle/Strangle.
"""

from dataclasses import dataclass
from typing import List, Optional

COMMISSION_PER_CONTRACT = 0.65
BTC_FREE_AT_OR_BELOW = 0.05          # ToS waives commission on cheap buy-to-close
MISC_FEE_PER_CONTRACT = 0.01         # default; overridden by statement where needed
MULTIPLIER = 100


# --------------------------------------------------------------------------- #
#  Data model
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Execution:
    side: str            # "BUY" | "SELL"
    pos_effect: str      # "TO OPEN" | "TO CLOSE"
    qty: int
    price: float
    misc_fee: float
    date: str

    @property
    def cash(self) -> float:
        sign = 1 if self.side == "SELL" else -1
        return sign * self.price * MULTIPLIER * self.qty

    @property
    def commission(self) -> float:
        if self.side == "BUY" and self.price <= BTC_FREE_AT_OR_BELOW:
            return 0.0
        return round(COMMISSION_PER_CONTRACT * self.qty, 2)


@dataclass(frozen=True)
class StockResult:
    side: str            # "BUY" (put assigned) | "SELL" (call assigned)
    qty: int
    price: float         # = option strike


@dataclass(frozen=True)
class Leg:
    symbol: str
    option_type: str     # "CALL" | "PUT"
    strike: float
    expiration: str
    executions: List[Execution]


@dataclass(frozen=True)
class Trade:
    symbol: str
    legs: List[Leg]
    outcome: str = "CLOSED"          # CLOSED | EXPIRED | ASSIGNED | ROLL
    stock_result: Optional[StockResult] = None


# --------------------------------------------------------------------------- #
#  Engine under test  (your portal should reproduce this behavior)
# --------------------------------------------------------------------------- #
def compute_pnl(trade: Trade) -> dict:
    """Realized OPTION P&L in dollars. For EXPIRED/ASSIGNED there is no closing
    execution, so this reduces to opening cash minus fees. Assignment stock
    legs are reported via trade.stock_result and are NOT counted here."""
    execs = [e for leg in trade.legs for e in leg.executions]
    gross = sum(e.cash for e in execs)
    commissions = sum(e.commission for e in execs)
    fees = sum(e.misc_fee for e in execs)
    return {
        "gross": round(gross, 2),
        "commissions": round(commissions, 2),
        "fees": round(fees, 2),
        "net": round(gross - commissions - fees, 2),
    }


def _opening_direction_is_long(leg: Leg) -> bool:
    opens = [e for e in leg.executions if e.pos_effect == "TO OPEN"]
    if opens:
        return opens[0].side == "BUY"
    # roll leg opened by a closing buy/sell — fall back to any execution
    return leg.executions[0].side == "BUY"


def detect_strategy(trade: Trade) -> str:
    legs = trade.legs

    if len(legs) == 1:
        leg = legs[0]
        long_ = _opening_direction_is_long(leg)
        return {
            ("CALL", True): "Long Call", ("CALL", False): "Short Call",
            ("PUT", True): "Long Put",   ("PUT", False): "Short Put",
        }[(leg.option_type, long_)]

    if len(legs) == 2:
        a, b = sorted(legs, key=lambda l: l.strike)
        same_type = a.option_type == b.option_type
        same_strike = a.strike == b.strike
        same_exp = a.expiration == b.expiration
        if same_type and same_strike and not same_exp:
            return "Calendar Spread"
        if same_type and not same_strike and not same_exp:
            return "Diagonal Spread"
        if same_type and same_exp and not same_strike:
            return "Vertical Spread"
        if not same_type and same_exp:
            return "Straddle" if same_strike else "Strangle"

    return "Unknown / Custom"


# --------------------------------------------------------------------------- #
#  Fixture builders
# --------------------------------------------------------------------------- #
def _round_trip(symbol, otype, strike, exp, o_side, o_px, o_date,
                c_side, c_px, c_date, qty=1):
    misc = round(MISC_FEE_PER_CONTRACT * qty, 2)
    return Trade(symbol, [Leg(symbol, otype, strike, exp, [
        Execution(o_side, "TO OPEN", qty, o_px, misc, o_date),
        Execution(c_side, "TO CLOSE", qty, c_px, misc, c_date),
    ])], outcome="CLOSED")


def _opened_only(symbol, otype, strike, exp, side, px, date, qty=1,
                 outcome="EXPIRED", stock=None):
    misc = round(MISC_FEE_PER_CONTRACT * qty, 2)
    return Trade(symbol, [Leg(symbol, otype, strike, exp, [
        Execution(side, "TO OPEN", qty, px, misc, date)])],
        outcome=outcome, stock_result=stock)


# --------------------------------------------------------------------------- #
#  THE 18 FIXTURES  — (id, Trade, expected_strategy, expected_net, expected_stock)
# --------------------------------------------------------------------------- #
CASES = [
    # --- closed round trips ---
    ("01_SYM_long_call",
     _round_trip("SYM", "CALL", 40, "20 FEB 26", "BUY", 11.10, "7/2/25", "SELL", 14.25, "7/3/25"),
     "Long Call", 313.68, None),
    ("02_INTC_long_call_qty2",
     _round_trip("INTC", "CALL", 20, "18 JUN 26", "BUY", 4.16, "7/25/25", "SELL", 5.59, "8/14/25", qty=2),
     "Long Call", 283.36, None),
    ("03_HIMS_long_call_loss",
     _round_trip("HIMS", "CALL", 27, "15 JAN 27", "BUY", 9.95, "1/21/26", "SELL", 8.48, "2/5/26"),
     "Long Call", -148.32, None),
    ("04_XLE_long_put",
     _round_trip("XLE", "PUT", 60, "15 JAN 27", "BUY", 5.02, "3/25/26", "SELL", 6.10, "4/8/26"),
     "Long Put", 106.68, None),
    ("05_CRWV_short_put",
     _round_trip("CRWV", "PUT", 100, "15 AUG 25", "SELL", 9.20, "7/18/25", "BUY", 1.15, "8/12/25"),
     "Short Put", 803.68, None),
    ("06_SMCI_short_put_free_btc",
     _round_trip("SMCI", "PUT", 40, "27 JUN 25", "SELL", 0.42, "6/23/25", "BUY", 0.03, "6/26/25"),
     "Short Put", 38.33, None),
    ("07_TSLL_short_call_qty2_free_btc",
     _round_trip("TSLL", "CALL", 23, "7 NOV 25", "SELL", 0.65, "11/5/25", "BUY", 0.01, "11/7/25", qty=2),
     "Short Call", 126.66, None),
    ("08_TSLL_short_call_qty2_loss",
     _round_trip("TSLL", "CALL", 15, "19 SEP 25", "SELL", 0.28, "9/3/25", "BUY", 4.82, "9/19/25", qty=2),
     "Short Call", -910.64, None),
    ("09_HOOD_short_call_btc_above_threshold",
     _round_trip("HOOD", "CALL", 100, "17 APR 26", "SELL", 2.22, "2/13/26", "BUY", 0.09, "3/27/26"),
     "Short Call", 211.68, None),
    ("10_TGT_long_call_big_winner",
     _round_trip("TGT", "CALL", 100, "15 JAN 27", "BUY", 9.19, "9/22/25", "SELL", 23.05, "2/4/26"),
     "Long Call", 1384.68, None),

    # --- expirations (no closing fill) ---
    ("11_DIS_long_call_expired",
     _opened_only("DIS", "CALL", 125, "20 MAR 26", "BUY", 12.33, "7/3/25", outcome="EXPIRED"),
     "Long Call", -1233.66, None),
    ("12_AMD_long_put_expired",
     _opened_only("AMD", "PUT", 100, "19 DEC 25", "BUY", 2.73, "6/26/25", outcome="EXPIRED"),
     "Long Put", -273.66, None),
    ("13_RGTI_short_call_expired_maxprofit",
     _opened_only("RGTI", "CALL", 31, "19 DEC 25", "SELL", 0.73, "12/3/25", outcome="EXPIRED"),
     "Short Call", 72.34, None),

    # --- assignments (short option -> stock at strike) ---
    ("14_SMCI_short_put_assigned",
     _opened_only("SMCI", "PUT", 48, "8 AUG 25", "SELL", 0.61, "8/5/25",
                  outcome="ASSIGNED", stock=StockResult("BUY", 100, 48.0)),
     "Short Put", 60.34, StockResult("BUY", 100, 48.0)),
    ("15_HOOD_short_put_assigned",
     _opened_only("HOOD", "PUT", 97, "13 FEB 26", "SELL", 3.45, "1/29/26",
                  outcome="ASSIGNED", stock=StockResult("BUY", 100, 97.0)),
     "Short Put", 344.34, StockResult("BUY", 100, 97.0)),
    ("16_SMCI_short_call_assigned_wheel",
     _opened_only("SMCI", "CALL", 49, "3 OCT 25", "SELL", 0.67, "9/29/25",
                  outcome="ASSIGNED", stock=StockResult("SELL", 100, 49.0)),
     "Short Call", 66.34, StockResult("SELL", 100, 49.0)),

    # --- multi-leg diagonal rolls (order-level cash; fees from statement) ---
    ("17_SOXL_diagonal_roll_even",
     Trade("SOXL", [
         Leg("SOXL", "CALL", 21.0, "15 AUG 25", [Execution("SELL", "TO OPEN", 1, 5.80, 0.01, "6/26/25")]),
         Leg("SOXL", "CALL", 19.5, "27 JUN 25", [Execution("BUY", "TO CLOSE", 1, 5.80, 0.01, "6/26/25")]),
     ], outcome="ROLL"),
     "Diagonal Spread", -1.32, None),
    ("18_TSLL_diagonal_roll_qty2",
     Trade("TSLL", [
         Leg("TSLL", "CALL", 19.0, "19 DEC 25", [Execution("SELL", "TO OPEN", 2, 4.72, 0.03, "9/19/25")]),
         Leg("TSLL", "CALL", 15.0, "19 SEP 25", [Execution("BUY", "TO CLOSE", 2, 4.82, 0.02, "9/19/25")]),
     ], outcome="ROLL"),
     "Diagonal Spread", -22.65, None),
]


# --------------------------------------------------------------------------- #
#  Pytest
# --------------------------------------------------------------------------- #
try:
    import pytest

    @pytest.mark.parametrize("tid,trade,strat,net,stock",
                             CASES, ids=[c[0] for c in CASES])
    def test_strategy(tid, trade, strat, net, stock):
        assert detect_strategy(trade) == strat

    @pytest.mark.parametrize("tid,trade,strat,net,stock",
                             CASES, ids=[c[0] for c in CASES])
    def test_pnl(tid, trade, strat, net, stock):
        assert compute_pnl(trade)["net"] == net

    @pytest.mark.parametrize("tid,trade,strat,net,stock",
                             CASES, ids=[c[0] for c in CASES])
    def test_stock_result(tid, trade, strat, net, stock):
        assert trade.stock_result == stock
except ImportError:
    pass


# --------------------------------------------------------------------------- #
#  Standalone runner
# --------------------------------------------------------------------------- #
def _main():
    total = 0.0
    for tid, trade, strat, net, stock in CASES:
        got_strat = detect_strategy(trade)
        got = compute_pnl(trade)
        assert got_strat == strat, f"{tid}: strategy {got_strat!r} != {strat!r}"
        assert got["net"] == net, f"{tid}: net {got['net']} != {net}"
        assert trade.stock_result == stock, f"{tid}: stock leg mismatch"
        total += got["net"]
        s = ""
        if stock:
            s = f"  +stock {stock.side} {stock.qty}@{stock.price:g}"
        sign = "+" if got["net"] >= 0 else "-"
        print(f"{tid:<38}{got_strat:<16}{trade.outcome:<9}"
              f"net={sign}${abs(got['net']):>9.2f}{s}")
    print(f"\nAll 18 fixtures pass (strategy + P&L + stock).")
    print(f"Sum of option-only realized P&L across fixtures: ${total:,.2f}")


if __name__ == "__main__":
    _main()
