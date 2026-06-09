# Design
_Created from Claude Design output — 2026-06-08_

## Design system source
All tokens defined in `design/theme.css`. Scoped under `.dash` class. Never override tokens inline — always reference via CSS variables.

## Typography
- **Font**: IBM Plex Sans (Google Fonts) — `font-family: 'IBM Plex Sans', system-ui, sans-serif`
- **Weights used**: 400, 450, 500, 600, 700
- **Numeric rendering**: `font-variant-numeric: tabular-nums` on all numbers
- **Anti-aliasing**: `-webkit-font-smoothing: antialiased`
- Font size scale: 9.5px (axis labels) → 10px/10.5px (table headers, caps labels) → 11px/11.5px (chips, hints) → 12px/12.5px (table cells, nav) → 13px (panel titles, body) → 14px (logo) → 19px/22px/24px (KPI values) → 30px (hero KPI)

## Color tokens (light / dark)

### Surfaces
| Token | Light | Dark |
|-------|-------|------|
| `--bg-page` | `#f6f7f9` | `#0e1116` |
| `--surface` | `#ffffff` | `#161a21` |
| `--surface-2` | `#f1f3f6` | `#1b2028` |
| `--inset` | `#eceff3` | `#11141a` |
| `--border` | `#e3e6eb` | `#252b34` |
| `--border-2` | `#d2d7df` | `#323a45` |
| `--hover` | `#f4f6f9` | `#1d232c` |

### Text
| Token | Light | Dark |
|-------|-------|------|
| `--text-1` | `#1a1d23` | `#e8ebef` |
| `--text-2` | `#5a6371` | `#99a2ad` |
| `--text-3` | `#8b939e` | `#6c7682` |
| `--text-faint` | `#aab0ba` | `#4d5662` |

### P&L (reserved exclusively for gains/losses — use nowhere else)
| Token | Light | Dark |
|-------|-------|------|
| `--pos` | `#08966a` | `#2dd4a7` |
| `--pos-soft` | `#2dd4a7` | `#2dd4a7` |
| `--pos-wash` | `rgba(45,212,167,0.12)` | `rgba(45,212,167,0.13)` |
| `--neg` | `#d62f4d` | `#fb7185` |
| `--neg-soft` | `#fb7185` | `#fb7185` |
| `--neg-wash` | `rgba(251,113,133,0.12)` | `rgba(251,113,133,0.13)` |

### Accent & semantic
| Token | Light | Dark |
|-------|-------|------|
| `--accent` | `#5b5bd6` | `#818cf8` |
| `--accent-soft` | `#818cf8` | `#a5adfb` |
| `--accent-wash` | `rgba(129,140,248,0.12)` | `rgba(129,140,248,0.16)` |
| `--warn` | `#b9810b` | `#f2b237` |
| `--warn-soft` | `#f2b237` | `#f2b237` |

### Categorical (strategy charts only)
```
--cat-1: #5b5bd6  (Cash-Secured Puts)
--cat-2: #2dd4a7  (Covered Calls)
--cat-3: #f2b237  (Vertical Spreads)
--cat-4: #fb7185  (Iron Condors)
--cat-5: #38bdf8  (Long Options)
```

### Chart scaffolding
```
--grid: #eceef2 / #20262f    (gridlines)
--axis: #c9cfd8 / #38414c    (zero line, axis)
```

### Shadows
```
--shadow-sm: 0 1px 2px rgba(16,22,33,0.04), 0 1px 3px rgba(16,22,33,0.06)
--shadow-md: 0 1px 2px rgba(16,22,33,0.04), 0 6px 20px rgba(16,22,33,0.06)
```

## Core components

### Panel
White card with 1px border, 10px radius, shadow-sm. Header: `panel-hd` with `panel-title` (13px/600) and `panel-sub` (11px/450).

### Tile (KPI metric)
Panel variant: 9px radius, 11px/10px uppercase label, 19–30px/700 value with tabular nums, optional delta badge or sparkline.

### Status pills
Rounded pill with leading dot. Classes: `pill-open` (accent), `pill-closed` (text-2/inset), `pill-expired` (warn), `pill-assigned` (pos).

### Chip
Small filter/action tag: 11px/500, 4px 8px padding, 6px radius, border-2, surface bg.

### Segmented control (`.seg`)
Inset bg, 8px radius outer, 6px radius buttons. Active button: surface bg + shadow-sm.

### Table headers
10–10.5px, 600 weight, uppercase, 0.4px letter-spacing, text-3 color. Sticky on scroll. 1px border-bottom.

### Table rows
12–12.5px cells. Symbol: text-1/700. Strategy/metadata: text-2. P&L: pos/neg 700. Hover: `--hover` bg.

### §1256 badge
Inline on symbol cell: 9.5px/700, accent color, accent-wash bg, 4px radius, `margin-left: 2px`.

## Screen layouts

### Topbar (all screens)
Height 46–50px. Left: Logo (compact icon only) → tab nav. Center: live ticker quotes (SPX, NDX, VIX). Right: sync status → theme toggle → Import CSV CTA (text-1 bg) → user avatar (accent-wash, initials).

### Dashboard
3-column grid: `208px | minmax(0,1fr) | 312px`
- Left col: vertical KPI tiles stack
- Center: chart panels (monthly bars top, cumulative line below)
- Right col: strategy donut + recent trades strip

### Trades view
Full-width. Top: 4 summary stat cards. Below: filter toolbar (segmented status, strategy dropdown, symbol search, export chip). Below: scrollable table panel.

### Tax view
Grid of 4 panels: Realized Gains & Losses | Estimated Tax Exposure | Section 1256 | Wash Sale Flags.

### Import view
Drop zone (dashed border, upload icon, instructions). Below: column mapping preview. Below: import log with count of imported/skipped.

## Layout variations (from design exploration)
Three variations were produced. **Variation 3 ("Dense Bento")** is closest to the intended production aesthetic — Bloomberg-style panelized grid, tightest spacing, most data-dense.

- **Variation 1** — Classic Terminal: left sidebar nav, 2×2 chart grid
- **Variation 2** — Curve-Forward: horizontal nav, hero cumulative chart, 3-up secondary row
- **Variation 3** — Dense Bento: top nav bar, stat rail, center charts, right rail, trades table below

## Dark mode
Toggle via `html.dark` class on document root. Stored in `localStorage` key `ott-theme`. All tokens flip automatically — no component-level dark mode logic needed. Theme toggle button lives in Topbar (moon/sun SVG icon, 32×32, 8px radius, border).

## Logo / wordmark
Square icon (26×26, 7px radius, text-1 bg) with upward trend line in `--pos-soft`. Wordmark: "Tradesheet" 14px/700 + "Options Tracker" 9.5px/500 uppercase text-3. Compact variant: icon only.

## Icon system
Custom inline SVG paths, 1.6–1.9 stroke width, round linecap/join. All icons defined in `shared.jsx` `Icon` component. Names: grid, table, tax, upload, search, bell, gear, arrowUp, chevDown, chevRight, calendar, filter, download, flag, shield, spark, dot.

## Spacing rhythm
- Panel internal padding: `10–14px`
- Gap between panels: `11–13px`
- Page padding: `13–16px`
- Table cell padding: `10–11px 14px`
- Topbar height: `46–50px`

## Number formatting rules
- Always use `fmtSigned()` for P&L (shows + prefix, uses − not -)
- Always use `fmtUSD()` for absolute dollar amounts
- Tabular nums on all numeric displays
- Negative sign: use Unicode minus `\u2212` (−), not hyphen (-)
