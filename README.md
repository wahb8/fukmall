# Fukmall (will probably change the name later)

Fukmall is a client-side React + Vite composition editor prototype with a lightweight marketing/entry shell in front of the editor. It behaves like a compact design tool for a mobile-sized document, with layered artwork editing, text editing, raster painting, erasing, bucket fill, gradients, lasso selection, snapping, asset import, project-file save/open, and flattened PNG/JPEG export.

The Add Layer JSON flow now also supports an exact case-sensitive `"Layer name"` field for both JSON-created text and image layers. When that field is present and non-empty after trimming, the created layer uses that name; otherwise the existing default naming behavior is preserved.

Box-text auto-fit now also uses a font-agnostic shared measurement model during creation and resize.
The fit solver no longer wraps against the full box width and then rejects wider-overhang fonts after
the fact; instead it resolves the usable wrap width from the same font-specific canvas metrics that
drive editor rendering, inline editing, export, and selection bounds. This fixes the regression
where some fonts, especially `Arial`, could snap prematurely to `8px` on slight shrink while fonts
such as `Cairo` still behaved correctly.

Current image import behavior includes:

- validated PNG, JPG, JPEG, WEBP, and SVG import from the file picker, external desktop drop, and asset-library canvas drop
- default-on transparent-edge trimming for eligible raster imports, with a toggle in the `File` menu
- SVG-backed imports that stay vector-backed for normal display instead of being silently rasterized

## Getting Started

```bash
npm install
npm run dev
```

Other useful scripts:

- `npm run build`
- `npm run lint`
- `npm run preview`
- `npm run test`
- `npm run test:run`

## Project Shape

- `src/AppRoot.jsx` is the current top-level route switch between the landing page and the editor route.
- `src/pages/LandingPage.jsx` owns the marketing landing experience, including the current frontend-only onboarding entry points.
- `src/pages/EditorPage.jsx` is the thin editor-route wrapper around `src/App.jsx`.
- `src/App.jsx` is the main app shell and currently owns most editor behavior.
- `src/components/onboarding/` contains the large frontend-only onboarding modal and its tests/styles.
- `src/lib/` contains the main helper seams for document state, bitmap operations, text layout, export, and file serialization.
- `src/editor/` contains app-specific editor helpers and constants that sit above the lower-level domain modules.
- `src/components/editor/` contains thin presentational editor sections extracted from `App.jsx`.
- `docs/` is the primary documentation set for architecture, features, state/history behavior, and editing constraints.

## Tests

The repo now includes a lightweight unit-test foundation using:

- Vitest
- jsdom
- React Testing Library
- `@testing-library/jest-dom`

Current automated coverage is intentionally focused on the safest seams:

- pure helper/domain modules in `src/lib/`
- app-level helper logic in `src/editor/`
- a few stable presentational components in `src/components/editor/`
- targeted App-level regression coverage for box-text auto-fit runtime behavior across multiple fonts

The current baseline is green:

- `npm run build` passes
- `npm run test:run` passes
- `npm run lint` passes with the existing React hook dependency warnings in `src/App.jsx`

Current automated tests intentionally do not try to deeply cover the highest-risk interaction engine in `src/App.jsx`, including the full pointer lifecycle, raster surface cache coordination, and canvas gesture integration. Those areas still rely primarily on careful manual regression testing.

Recent text-specific regression coverage now includes app-level auto-fit resize checks for:

- `Arial`
- `Cairo`
- `Ubuntu`
- `Georgia`

## Documentation

Start with:

1. [`docs/architecture.md`](./docs/architecture.md)
2. [`docs/state-and-history.md`](./docs/state-and-history.md)
3. [`docs/features.md`](./docs/features.md)
4. [`docs/file-map.md`](./docs/file-map.md)

## Current Product Constraints

- Group layers are intentionally disabled in the user-facing app, even though some internal helper code remains.
- Undo/redo is snapshot-based and stored in memory only.
- Project files save the current document, but not undo/redo history or session-local runtime state.

## Persistence Notes

- On startup, the app first tries to restore the last current document from `localStorage`.
- If no saved current document exists, it falls back to the seeded demo composition.
- The current document autosaves locally, while explicit `.kryop` project files remain the portable save/open format.
- If local autosave fails, the app now shows an inline transient error instead of throwing and blank-screening the editor.
