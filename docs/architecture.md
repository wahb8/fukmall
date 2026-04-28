# Architecture

## High-Level Shape

Fukmall is a client-side React + Vite app with a lightweight landing/entry shell in front of a
single large editor orchestration component in `src/App.jsx`.

At a high level, the app is split into four layers:

1. route-level UI composition in `src/AppRoot.jsx`, `src/pages/`, `src/components/onboarding/`, and `src/components/editor/`
2. app-specific editor helpers in `src/editor/`
3. reusable document, raster, text, history, and geometry helpers in `src/lib/`
4. static assets and fonts in `src/assets/` and `public/`

The editor behaves like a small layered composition tool for a mobile-sized document. The runtime
mixes React state, mutable refs, and offscreen canvas surfaces to keep pointer interactions
responsive without committing every intermediate step into React history.

## Runtime Model

### React Shell

`src/main.jsx` mounts the app in `StrictMode`.

`src/AppRoot.jsx` is the current top-level route switch. It uses the existing pathname-based
approach rather than a routing library:

- `/` renders the marketing landing page
- `/app` renders the editor route
- `/pricing` renders the pricing page

`src/pages/EditorPage.jsx` is intentionally thin and exists so route-level composition can stay out
of `src/App.jsx`.

The landing page in `src/pages/LandingPage.jsx` now owns a frontend-only auth modal that opens
from the `Log in` and `Sign up` buttons, while the primary CTA still navigates directly to `/app`.

`src/pages/PricingPage.jsx` follows the same pattern for its top-nav auth buttons and keeps the
pricing comparison table, featured tier badge, FAQ section, and CTA stack.

`src/App.jsx` still owns most product behavior:

- document state and undo/redo integration
- active tool and viewport state
- pointer interaction routing
- raster surface cache coordination
- layer selection, move, resize, and snapping behavior
- import/export and project-file flows
- theme state, current-document autosave, and unsaved-change tracking
- the shared validated image-import path, including trim-on-import preference wiring and import failure surfacing
- the selection-overlay render path that keeps editor chrome separate from artwork opacity

Several stable UI sections have been extracted into presentational components, but `App.jsx`
remains the control center for editor orchestration.

The editor shell now also includes a first-entry empty-canvas overlay in `/app`:

- the initial empty state shows a centered plus sign inside the artboard
- clicking the plus or the canvas in that state opens the existing New File flow
- the overlay is UI-only and disappears after a file is created or opened
- it does not alter document history or dimensions

The onboarding flow deliberately does not live in `App.jsx`. Its state is local to
`src/components/onboarding/OnboardingModal.jsx`, including:

- current onboarding step
- selected business type
- uploaded onboarding reference images

This keeps pre-editor marketing/onboarding behavior separate from editor runtime complexity.

### `src/components/site/`

This folder now holds shared non-editor site chrome such as the auth modal used on landing and
pricing.

Current responsibilities:

- `AuthModal` for frontend-only login, sign-up, and reset-password placeholder flows
- shared modal composition for the non-editor pages

### Document State

Persistent document state flows through `useHistory` in `src/hooks/useHistory.js`.

The document model stays intentionally compact:

```js
{
  name,
  width,
  height,
  layers,
  selectedLayerId,
  selectedLayerIds,
}
```

Undo/redo is snapshot-based. Pointer-heavy interactions usually render through transient state
first, then commit one history step when the gesture ends.

### Transient Runtime State

Many important editor behaviors are deliberately not stored in the document snapshot:

- active tool
- brush/tolerance/gradient UI state
- viewport and snap guides
- asset library contents
- lasso, marquee, and floating-selection state
- open menus and modal state
- raster surface caches and in-flight interaction metadata

This split is central to the current architecture. Features that touch drawing, text, selection, or
bitmap editing need to respect the boundary between persistent document truth and transient runtime
editing state.

## Module Boundaries

### `src/components/editor/`

These are mostly presentational editor sections:

- toolbar
- file menu
- asset library
- add-layer panel
- layer stack panel
- prompt shell
- modal surfaces

They receive state and callbacks from `App.jsx` and generally avoid owning editor logic.

### `src/components/onboarding/`

This folder holds the frontend-only onboarding flow shown from the landing page before entering the
editor.

Current responsibilities:

- business-type selection UI
- business-type card imagery for the current onboarding options
- five-slot reference-image intake UI with local preview URLs
- replacement of already-filled upload slots plus multi-file fill of remaining empty slots
- final placeholder step before entering `/app`

This onboarding state is intentionally session-local and does not touch editor document state,
project files, history, or persistence helpers.

### `src/editor/`

This folder holds app-level helpers that are more specific than the generic `src/lib/` layer:

- shared editor constants
- seeded document creation and import-placement helpers
- add-layer JSON parsing and form normalization
- icon/theme asset mapping
- initial document state helpers used to distinguish the first-entry canvas placeholder from a
  restored or opened document

This is the preferred seam for logic that belongs to the editor product but should not live inline
in `App.jsx`.

### `src/lib/`

This is the main domain/helper layer.

Key responsibilities:

- `layers.js`: document and layer creation/mutation helpers
- `history.js`: snapshot history primitives
- `documentFiles.js`: project-file serialization, normalization, and current-document storage
- `raster.js`: low-level canvas, image decoding, bitmap composition, flood fill, and gradients
- `textLayer.js`: text layout, style-range normalization, measurement, and canvas rendering
- `layerGeometry.js`, `viewport.js`, `moveSnapping.js`: geometry and interaction math
- `penTool.js`, `eraserTool.js`, `lassoTool.js`, `rectSelectTool.js`: tool-specific bitmap helpers

These helpers are the safest place to extend behavior before wiring it back into `App.jsx`.

One important recent constraint in `textLayer.js`:

- box-text auto-fit now derives its effective wrap width from the same font-specific canvas metrics
  used by rendering, instead of wrapping against the raw box width and only later adding glyph
  overflow padding
- this keeps the fit solver font-agnostic across families such as `Arial`, `Cairo`, and bundled
  fonts, and keeps selection bounds aligned with the fitted layout

## Persistence Model

The app currently has two persistence paths:

- project files via `.kryop`
- automatic current-document storage in `localStorage`

`src/lib/documentFiles.js` normalizes documents during load/save. That normalization currently:

- strips disabled group layers
- repairs invalid selection state
- repairs broken linked-layer references
- normalizes text style ranges
- clamps image corner radius

The UI chrome also persists some state outside the document:

- theme in `localStorage`
- global foreground/background colors in `localStorage`

Undo/redo history, asset-library contents, raster caches, and other runtime-only interaction state
are still not persisted.

## Rendering Model

Normal layer display is primarily DOM-driven, but bitmap editing relies on canvas surfaces.

Important current rendering patterns:

- raster/image/text bitmap edits use live surface caches and commit back to serialized layer data
- text remains structured and editable, with bitmap mask/overlay support layered on top
- SVG-backed image layers stay vector-backed for normal viewing and transforms
- some bitmap-only workflows temporarily rasterize SVG layers when direct pixel access is needed
- pen drawing on an SVG layer creates a new raster layer above the SVG instead of flattening it

This mixed model is one of the repo's main architectural constraints.

## Testing And Risk Areas

The test suite focuses on helper modules, hook behavior, and stable presentational components.

The highest-risk areas remain lightly covered and rely on manual regression testing:

- pointer lifecycle orchestration in `src/App.jsx`
- raster surface cache synchronization
- canvas-stage hit testing and gesture routing
- complex text-editing interactions

There is now additional targeted App-level regression coverage for the font-sensitive box-text
auto-fit path, including shrink/grow behavior and selection-bound sync across multiple fonts.

Recent regression coverage also includes:

- landing and pricing auth modal open/close behavior
- pricing-page navigation and the onboarding-triggering `Get Started` buttons
- the first-entry editor state and new-file modal behavior

When adding features, prefer pushing logic into `src/lib/`, `src/editor/`, or extracted components
first, then keep `App.jsx` as the integration layer.
