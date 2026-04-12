# Overall Architecture

## Summary

This app is a client-side React + Vite editor prototype for building and editing a layered mobile-sized composition. It behaves like a lightweight design tool with a document model, layer stack, editable text, raster painting, gradient application, bucket fill, erasing, lasso selection, rectangular marquee selection, snapping, zooming, and an asset library.

The architecture is simple in packaging but dense in implementation:

- React renders the full editor UI.
- `src/App.jsx` remains the main orchestrator, but now delegates stable UI sections into
  focused editor components.
- Small utility modules in `src/lib/` handle data transforms, canvas operations, tool math, and document helpers.
- `src/editor/` now holds app-specific constants and document/file helper logic that does not belong in the lower-level domain modules.
- `src/components/editor/` now holds presentational editor UI sections such as the toolbar, file menu, modals, asset library, prompt shell, and layer panel.
- Undo/redo is snapshot-based.
- Raster and text surfaces are cached in memory using `canvas` elements stored in refs.
- The app now supports flattened image export and simple file-based project save/open workflows.
- The repo now also has a conservative Vitest-based unit/component test layer around pure helpers,
  app-level editor helpers, and thin presentational components.

## Runtime Layers

### 1. App Shell

`src/main.jsx` mounts the app and imports global CSS.

`src/App.jsx` is the actual product shell. It owns:

- tool switching
- selection and interaction flow
- keyboard shortcuts
- document edits and history commits
- synchronization between persistent document state and temporary canvas surfaces
- wiring of extracted editor UI components

Stable UI sections such as the toolbar, file menu, new-file modal, unsaved-changes modal,
asset library, prompt shell, and layer panel now render through `src/components/editor/`.

The highest-risk logic still stays in `App`:

- canvas viewport and stage
- pointer lifecycle and tool routing
- raster surface cache coordination
- text edit transitions
- lasso/floating selection behavior
- rectangular marquee and floating-rect selection behavior
- layer inspector behavior
- text-shadow orchestration for text layers
- asset-library-to-canvas wiring
- project-file open/save/new actions
- flattened export actions

### 2. Document Model

The document model lives in `src/lib/layers.js`.

The document currently contains:

- `name`: document/file name
- `width`: document width in pixels
- `height`: document height in pixels
- `layers`: a flat ordered array
- `selectedLayerId`: single active layer
- `selectedLayerIds`: multi-selection support

Each layer is an object with common transform/display fields such as:

- `id`
- `name`
- `type`
- `visible`
- `opacity`
- `x`, `y`
- `width`, `height`
- `rotation`
- `scaleX`, `scaleY`
- `lockTransparentPixels`
- `linkedLayerId`

Layer-specific fields are currently active for `shape`, `image`, `raster`, and `text`.

Text layers also now support normalized `styleRanges` entries:

- each range stores `start`, `end`, and partial `styles` overrides
- base text-layer style fields remain the fallback/default style
- text measurement and rendering now resolve these ranges into styled runs for both editor canvas rendering and export

Linked layers are a lightweight relationship in the document model. A valid link is reciprocal:

- each layer points at the other layer's ID through `linkedLayerId`
- project-file normalization clears stale or one-sided links
- text-shadow layers build on top of this same linking mechanism

The codebase still retains an internal `group` layer shape for future work, but group layers are
currently filtered out of normalized document state so the feature is not user-accessible.

### 3. History Layer

Undo/redo is implemented as plain state snapshots in `src/lib/history.js` and exposed to React through `src/hooks/useHistory.js`.

There are two update modes:

- committed changes: added to undo history
- transient changes: temporary state used while dragging, resizing, or interacting before commit

This is important because many interactions preview in real time and only write a permanent history step on pointer release.

The history layer can also be reset when a project file is opened or a new file is created.

### 4. Rendering Layer

The app uses normal React DOM for UI chrome and individual layer wrappers, but actual raster/text painting uses HTML canvas.

`src/lib/raster.js` provides the low-level canvas helpers:

- create canvases
- load image sources
- clone/crop canvases
- serialize canvas to PNG data URL
- apply masks
- apply linear gradients on bitmap surfaces
- perform contiguous flood fill on bitmap surfaces
- translate pointer coordinates into canvas-local coordinates

`src/App.jsx` also keeps a `rasterSurfacesRef` map. Each erasable layer can have:

- `offscreenCanvas`
- `maskCanvas`
- `paintOverlayCanvas`
- `visibleCanvas`
- `layerElement`
- a sync token and bitmap key

That cache allows the UI to repaint quickly without rewriting the persisted document object on every pointer move.

The current pen model uses those cached canvases as fixed-size working surfaces for normal drawing. The app no longer grows raster layer bounds dynamically during pen strokes. Some non-pen bitmap operations can still allocate larger temporary working surfaces when the operation itself needs more editable area.

### 5. Tool Modules

Feature logic is split into focused helper modules:

- `penTool.js`: smooth stroke generation and brush behavior
- `eraserTool.js`: erase/mask drawing ops
- `raster.js`: also hosts the gradient and bucket-fill bitmap implementations used for bitmap layers
- `lassoTool.js`: polygon selection and floating selection extraction
- `rectSelectTool.js`: rectangular marquee extraction, clipping, and overlay helpers
- `moveSnapping.js`: snapping to frame center and edges
- `viewport.js`: screen/world coordinate transforms
- `textLayer.js`: text measurement, wrapping, layout sync, and canvas rendering
- `colors.js`: global foreground/background storage
- `documentFiles.js`: project-file parsing, normalization, and download helpers

## Data Flow

The main data flow for most interactions is:

1. User input starts in `App`.
2. `App` resolves the active layer/tool and pointer coordinates.
3. A transient interaction object is stored in `interactionRef`.
4. Pointer move events update either:
   - transient document state via `setTransient`, or
   - in-memory canvases via `rasterSurfacesRef`, or
   - transient overlay state such as the gradient preview line, snap guides, lasso overlays, or marquee overlays
5. Pointer up finalizes the result.
6. The result is committed into document history with `commit` or `commitTransientChange`.

Layer picking also has a shared topmost-layer resolver in `App`:

- cheap transformed-bounds rejection happens first
- raster, image, and text layers then use pixel-aware hit testing against their visible canvas surfaces
- the hit test uses a small nearby-pixel padding radius so selection is less brittle around thin strokes and anti-aliased edges
- transparent pixels can fall through to lower layers, but selected-frame drag behavior still keeps its explicit move affordance once a layer is already selected

## Architectural Characteristics

### Strengths

- Easy to run and reason about at a high level
- Most non-UI calculations are extracted into pure helpers
- No server or async data layer complexity
- Clear document-centric editing model

### Weaknesses

- `src/App.jsx` is very large and acts as controller, renderer, event router, and feature host
- many behaviors are coupled through shared refs and local state
- no formal domain boundary between product logic and UI composition
- snapshot history may become expensive as documents/features grow

## Testing Shape

The current automated testing strategy is intentionally narrow and stability-first.

Covered well:

- snapshot history behavior
- document/layer helper rules
- project-file normalization
- text helper logic
- snapping and viewport math
- app-level document helper behavior
- thin presentational editor components

Intentionally deferred for now:

- deep `src/App.jsx` pointer lifecycle coverage
- raster surface cache coordination
- full canvas gesture integration
- lasso/floating-selection orchestration inside the main app shell

This matches the current architecture: test the pure seams first, and leave the most coupled
interaction engine to manual regression testing until more of it is extracted cleanly.

## Current Extension Seams

The safest places to add behavior are:

- `src/lib/layers.js` for document mutations
- `src/lib/textLayer.js` for text-specific behavior
- `src/lib/raster.js` for bitmap/canvas helpers
- `src/lib/moveSnapping.js` for snapping logic
- `src/editor/` for app-specific constants and non-domain editor helpers
- `src/components/editor/` for presentational UI extraction that should stay thin
- extracted subcomponents/hooks if `src/App.jsx` starts being broken apart further

The riskiest place to edit directly is the middle of `src/App.jsx` pointer handling, because many tool behaviors share the same event lifecycle.
