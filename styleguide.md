# UI/UX Styleguide — Unified Streams

## 1. Principles
- Lightweight, clean, modern dark-mode aesthetic.
- Zero external CSS frameworks or heavy JS runtimes on server-rendered HTML pages (`/configure` and `/status`).
- Accessible, responsive layout (functional on mobile screens from 320px width upwards).
- Clear contrast ratios meeting WCAG AA standards.

## 2. Color Palette
- Background Primary: `#0f172a` (slate-900)
- Background Surface: `#1e293b` (slate-800)
- Background Elevated: `#334155` (slate-700)
- Border Subtle: `#334155` (slate-700)
- Border Focused: `#6366f1` (indigo-500)
- Text Primary: `#f8fafc` (slate-50)
- Text Secondary: `#94a3b8` (slate-400)
- Text Muted: `#64748b` (slate-500)
- Accent Primary: `#6366f1` (indigo-500)
- Accent Hover: `#4f46e5` (indigo-600)
- Success: `#10b981` (emerald-500)
- Warning: `#f59e0b` (amber-500)
- Danger: `#ef4444` (red-500)

## 3. Typography
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif`.
- Monospace font stack for URLs, codes, and JSON: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`.

## 4. Components & Layout
- Layout container: maximum width `720px`, centered, padding `1.5rem` (`1rem` on mobile).
- Card sections: rounded corners (`8px`), subtle border, grouped with distinct section headers.
- Form controls:
  - Inputs, selects, and textareas: full width where appropriate, distinct focus outline.
  - Checkboxes and radios: custom styled, accessible hit targets (min 44x44px touch area).
  - Buttons: prominent primary action (Install / Copy), clear secondary actions (Reset).
- Responsive:
  - Single column stacking below `640px`.
  - Flexible chips/grid for language selectors and resolution options.
