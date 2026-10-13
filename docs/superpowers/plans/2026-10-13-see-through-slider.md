# The see-through slider: plan

Spec: `docs/superpowers/specs/2026-10-13-see-through-slider-design.md`. Branch
`feat/see-through-slider`, core minor bump (Prism's row is unchanged, but the core's store is).

1. **Store (core `termLook.ts`)**: `termSeeThrough`, `setTermSeeThrough`, `useTermSeeThrough`,
   `SEE_THROUGH_TOP = 70`; a theme extra (reset, saved, applied); the one-time migration.
   `termAcrylic()` is `level > 0` in a window host. `termGroundAlpha()` is `1 - level/100` there.
   Unit tests first.
2. **The row (core `TerminalThemeSection.tsx`, a `Slider` in `fields.tsx`)**: a range input with
   the percent beside it in a window host; the switch as it is in Prism.
3. **Pickers**: this app's Background row and the theme editor's Background lose the Alpha bar.
4. **Save changes (core `useTermSetup.ts`)**: the level as an extra in place of `acrylic`, no
   ground-byte check; saves the ground opaque.
5. **This app**: `opacityMigration.ts` and the see-through bits of `AppearancePage`.
6. **e2e**: the see-through checks in every scenario that flips `term-acrylic`, for the slider;
   a new check: drag to 40, the ground alpha is 0.6 and the material on; 0 turns it off; Save
   changes lights; a theme pick asks and drops it; Custom brings it back.
7. **Docs**: `regression-rules.md` #114 and #156, `two-apps.md`, `core/README.md`.
8. **Verify**: unit, typecheck, lint, full e2e, Prism's typecheck and unit against the branch's
   core, then package and install for the owner.
