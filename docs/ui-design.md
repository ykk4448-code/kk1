# AETHER · Interface design guide (2026-10)

## Scope

A visual-system redesign of the **existing AETHER 4.x application**. It intentionally leaves service APIs, simulation algorithms, route IDs, form event bindings and current module structure untouched.

### Information architecture contract

- **Primary page / `#/home`**: exactly five interactive business destinations and no visible sidebar/topbar: 基础数据、想定管理、联合投送方案、行动推演、评估分析.
- **Secondary workspace / `#/{module}/{tab}`**: the chosen module owns its sidebar, filters, tables, geospatial visualization and task operations.
- A user can return to the primary page using the explicit button; refresh and back/forward must maintain the selected page.

### Design foundations

Inspired by the restraint and information hierarchy of professional development tools and geospatial consoles, without copying assets or page templates.

| Element | Design |
|---|---|
| Background | Warm paper `#f6f5f2` for the entry directory, cool `#f4f5f3` for workspaces |
| Navigation | Graphite `#202e37` scoped to secondary pages |
| Surfaces | White `#ffffff`, fine line `#dee4e3`, almost no shadow |
| Primary ink | Graphite `#192633` |
| Wayfinding | Deep mineral teal `#275b66` for active/edit actions |
| Orientation | Rust `#ad5c41` for numerals and small labels; never for arbitrary decoration |
| Text | Inter, Noto Sans SC, native CJK sans; 13–14px default for functional content |
| Numeric data | Tabular lining numbers; stable widths in measurements and tables |
| Spacing | 4/8px rhythm, 32px content margin, 13–16px table text |
| Motion | 150–180ms restrained transitions, respects reduced-motion preference |

### Design rules

1. Data and task outcomes come before decoration: no random glows, large ornamental charts or gradient stat tiles.
2. A page heading introduces the current job; the local sidebar only contains the selected module's subfeatures, never duplicates the five top-level destinations.
3. Destructive operations are visually distinguishable; keyboard focus must remain visible.
4. Tables scroll *inside their pane*, never force the entire viewport horizontally.
5. Maps identify synthetic scenario edges separately from physical geospatial reference points. City base maps require connectivity.
6. Portal / dashboard / data table components have distinct visual hierarchies, not a universal card design repeated everywhere.
7. Screenshots in UI reviews must identify whether the browser is rendering a fixture preview or a live backend.

### Verification

- Run `python scripts/build_preview.py` to create a **read-only**, fixture-based preview.
- Run `python frontend/tests/test_navigation_browser.py` for the five-button routing contract.
- Run `python frontend/tests/test_visual_design_browser.py` for 1440px/768px/390px viewports, module entry routes, overflow, JS runtime checks (requires Playwright + Chromium).
- Run backend CI separately. CSS-only changes do not establish or alter backend correctness.

**Files:** `frontend/assets/styles.css` (legacy styles), `frontend/assets/workbench.css` (v4 working style), `frontend/assets/design-v5.css` (final design-system overrides). The latter **must load last** on both the live page and generated preview.
