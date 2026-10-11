# Plan: vertical tabs and the mono Ring (#162)

Spec: `docs/superpowers/specs/2026-10-11-vertical-tabs-design.md`.

1. **Core, the mono Ring.** `tabMark.ts`: `ring` answers `place: 'ring'` with no colour role for every
   state (spin, breathe, still). `TabMark.tsx`: the ring draws the spinner, a check, a breathing dot
   or a cross in `currentColor`. Tests: `tabMark.test.ts`, `TabMark.test.ts`. Settings copy for Ring.
   Core version bump.
2. **Shared pieces lifted out of `TabStrip`** without changing it: `components/tabLooks.ts` (every
   tab's state, mark and palette) and `components/tabMenus.tsx` (the tab menu and the + menu, with
   `menuGlyphs.tsx`).
3. **Prefs.** `lib/tabLayoutPrefs.ts` (`prism.window.tabLayout`), `lib/sidebarPrefs.ts`
   (`prism.window.sidebar`, `prism.window.sidebarWidth`), each with a test.
4. **Hover reveal.** `lib/hoverReveal.ts`: the timing as a plain controller (`createReveal`, tested
   with fake timers) and the hook that feeds it pointer moves.
5. **The sidebar.** `components/TabSidebar.tsx`: rows, marks from `useTabLooks`, menus, pick,
   middle-click close, pointer reorder along y (`dropSlot` with top/height as its lanes), folder drop,
   resize grip, collapse button, collapsed reveal. Powerline geometry in `lib/promptGeometry.ts`
   (`sideSegmentClip`, `sideEdgeClip`).
6. **The hidden title bar.** `components/HoverTitleBar.tsx`, used only with vertical tabs and the
   title bar off.
7. **App.** One `tabProps` for both lists; the layout switch; the host in a row beside the sidebar.
8. **Settings.** The Tab position row first in Window (`appOptions`, `settingsIndex`, the e2e page
   map, a new `sidebar` icon), and the title bar row's subtext for vertical.
9. **e2e.** `verticalTabs` (layout, marks in both styles and three indicators, pick, drag, collapse
   and reveal with the terminal unmoved, hidden title bar); `indicatorStyles` updated for the mono
   Ring.
10. **Docs and versions.** README, core README, CLAUDE.md scope; app 0.39.0, core 0.33.0.
