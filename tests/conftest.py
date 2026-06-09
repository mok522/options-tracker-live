"""
conftest.py — pytest session fixture that patches test_options_pnl's compute_pnl
and detect_strategy to call the portal's TypeScript pnlEngine via tsx subprocess.

The test file (test_options_pnl.py) is not modified. All 18 fixtures are sent
to portal_adapter.ts in a single subprocess call; results are cached by trade
object identity.
"""

import dataclasses
import json
import os
import subprocess

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TSX = os.path.join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx')
_ADAPTER = os.path.join(PROJECT_ROOT, 'tests', 'portal_adapter.ts')


@pytest.fixture(scope='session', autouse=True)
def _patch_with_portal_engine():
    import test_options_pnl as mod

    payload = json.dumps([dataclasses.asdict(trade) for _, trade, *_ in mod.CASES])

    proc = subprocess.run(
        [_TSX, _ADAPTER],
        input=payload,
        capture_output=True,
        text=True,
        cwd=PROJECT_ROOT,
    )
    if proc.returncode != 0:
        pytest.fail(f'portal_adapter.ts failed:\n{proc.stderr}')

    portal_results = json.loads(proc.stdout)
    cache = {id(trade): result for (_, trade, *_), result in zip(mod.CASES, portal_results)}

    orig_compute_pnl = mod.compute_pnl
    orig_detect_strategy = mod.detect_strategy

    def _compute_pnl(trade):
        r = cache.get(id(trade))
        return r['pnl'] if r is not None else orig_compute_pnl(trade)

    def _detect_strategy(trade):
        r = cache.get(id(trade))
        return r['strategy'] if r is not None else orig_detect_strategy(trade)

    mod.compute_pnl = _compute_pnl
    mod.detect_strategy = _detect_strategy
