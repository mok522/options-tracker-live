# Options Trade Tracker (Tradesheet)

## Project overview
A single-page web app for retail options traders using Charles Schwab / ThinkOrSwim. All data comes from a CSV export of the ThinkOrSwim account statement — no manual entry. Tracks realized P&L, open positions, commissions, strategy breakdown, and tax exposure including Section 1256 and wash sale detection.

## Context files
| File | Covers |
|------|--------|
| `context/ARCHITECTURE.md` | Component structure, data flow, storage schema, CSV parsing, file organization |
| `context/DESIGN.md` | Design system tokens, typography, color palette, component patterns, screen layouts, dark mode |
| `context/PROGRESS.md` | Build phases, completed milestones, current status, backlog, known gaps |
| `context/DECISIONS.md` | Key tradeoffs, rejected alternatives, rationale for implementation choices |

## Rules for Claude Code
- Read the relevant context file(s) before making any changes
- After every meaningful change, update the appropriate context file
- Never change business logic (CSV parsing, storage, tax calculations) when the task is UI-only
- Never change UI/styling when the task is logic-only
- Ask before adding new dependencies
- Design tokens live in `theme.css` — always use CSS variables, never hardcode colors or fonts
- P&L positive/negative states must always use `--pos` / `--neg` exclusively — no other colors for gains/losses
