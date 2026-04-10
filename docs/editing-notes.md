# Editing Notes

## Baseline Status

At the time this documentation was written:

- `npm run build` succeeds
- `npm run lint` reports warnings, not errors
- the warnings are React hook dependency warnings in `src/App.jsx`

## Important Constraints

### `src/App.jsx` Is the Control Center

Most product behavior is centralized in `src/App.jsx`.

That means:

- changes are often easy to wire in quickly
- but regression risk is higher because many features share the same local state and event flow
- some low-risk render sections have now been extracted into `src/components/editor/`, but the
  pointer lifecycle and orchestration logic still live in `App`

### The Repo Is Mid-Evolution

There are signs of active expansion:

- newer modules such as `colors`, `lassoTool`, `moveSnapping`, `textLayer`, and `viewport`
- leftover starter assets such as `react.svg` and `vite.svg`
- a legacy-looking `textObject.js` helper

This is a normal state for a prototype, but it means code style and ownership boundaries are not fully settled yet.

## Recommended Edit Strategy

Prefer this order when making changes:

1. update or add pure helper logic in `src/lib/`
2. keep document mutations in `src/lib/layers.js`
3. keep rendering math in `src/lib/raster.js`, `src/lib/textLayer.js`, or `src/lib/viewport.js`
4. use `src/editor/` for app-specific constants and editor helpers that are above the domain layer but below UI composition
5. use `src/components/editor/` for stable presentational sections
6. only then wire the feature into `src/App.jsx`

This keeps `App` from getting even more overloaded.

## Best Refactor Opportunities

If the app continues growing, the best extractions are:

- a `CanvasStage` component
- a `LayerInspector` component
- a `useCanvasInteractions` hook
- a `useRasterSurfaceCache` hook
- a dedicated document context/store if multi-file coordination grows

Some lower-risk extractions have already happened:

- toolbar
- file menu
- new-file and unsaved-changes modals
- asset library panel
- layer panel
- prompt shell

## Known Gaps or MVP Behavior

### Document Persistence

The app now supports simple project-file persistence.

Current behavior:

- full documents can be saved and reopened through `.kryop` project files
- only the current document is saved in v1, not the full undo/redo stack
- global colors are still persisted separately in `localStorage`
- saved/opened documents also pass through normalization, which repairs selection state, repairs invalid linked-layer references, and strips disabled group layers
- runtime-only editor state such as live canvas caches, refs, lasso/floating selections, and drag state should continue to be treated as non-persistent

### New File Workflow

The file workflow now includes document creation UI, not just open/save/export.

Current behavior:

- `New File` opens a modal for document name, width, and height
- creating a new file rebuilds the seeded demo document at the requested dimensions
- choosing `New File` while the current document is dirty opens an unsaved-changes confirmation modal first
- the app also registers a browser `beforeunload` prompt while unsaved changes exist

If future work changes file workflows, keep the dirty-state logic, filename sanitization, and runtime reset behavior aligned with the current save/open/new implementation.

### Group Layers

Group layers are currently disabled for users.

Current behavior:

- the seeded new-file document no longer includes a group placeholder
- normalized document state strips group layers from project files before they re-enter the app
- internal group-layer helpers are still kept in the codebase for later implementation work

### Default New File State

Fresh documents now start with a full-canvas white background layer at the bottom of the stack.

### Text Paint Remapping

Paint overlay on text layers does not intelligently remap when text content/font changes significantly.

### Text Alignment And Edit Entry

Text layout now depends on a real `textAlign` layer field.

Current behavior:

- `left`, `center`, and `right` alignment are rendered through the shared text layout/render helpers
- box text alignment affects per-line placement inside the box while preserving wrapping/reflow
- point text alignment preserves the layer's intended horizontal anchor when content or alignment changes
- the selected-layer selection frame now forwards double-click into text editing for text layers
- when inline editing opens, the textarea caret is moved to the end of the current text

If future work changes text editing again, preserve the shared renderer path so editor view, inline editing, and export do not drift apart.

### Partial Text Styling

Text layers now also carry normalized `styleRanges` data for selected-range styling.

Current behavior:

- supported style changes can target only the highlighted text range while inline editing is active
- when there is no highlighted range, those controls still use the existing whole-layer style path
- range data is part of the document model, so it survives undo/redo and project-file save/load
- the shared text renderer now resolves `styleRanges` into styled runs so wrapping, alignment, bounds, editor rendering, and export stay aligned
- text-layer surface cache invalidation must include `styleRanges`, otherwise partial-style edits can appear stale until some unrelated geometry change forces a redraw
- edit mode now relies on the same styled canvas preview as normal rendering, with the textarea acting as the input/caret layer rather than replacing the styled visual output

If future work expands this area, keep the data-model and normalization path stable while replacing the renderer separately.

### History Scaling

History stores full state snapshots, not patches.

This is acceptable for an MVP but may become expensive for larger documents or persistent storage.

### Raster Pen Surface Model

Recent behavior changes made raster pen editing less brittle, but also more subtle internally:

- raster pen commits should not auto-crop the layer down to the first painted alpha bounds
- after moving a raster layer, later paint interactions must resolve coordinates from the layer's current transform, not stale geometry captured by older pointer handlers
- when a raster stroke grows beyond the current working surface, the transient preview should expand inside the cache layer without making the layer appear to pan or re-center during the gesture

If future work touches raster painting again, preserve the split between:

- stable on-screen layer placement during the live stroke
- transient preview-only surface expansion in the raster cache
- final committed layer geometry written on pointer-up

### Import Behavior

Imported images now preserve their intrinsic dimensions by default.

The current import rules are:

- no automatic shrink-to-fit step for normal image imports
- no automatic shrink-to-fit step for asset-library drops
- default placement is clamped into the document bounds so large images do not land partly off-canvas

If future work adds optional "fit to canvas" behavior, it should be an explicit user-facing action rather than the default import path.

The app also now supports external desktop file drag/drop for supported image files.

Current behavior:

- external image drops reuse the direct file-import placement path rather than the asset-library drop path
- the drop overlay is transient UI only and should not interfere with internal asset-library drags
- detection should stay conservative so unsupported file drags do not trigger the import affordance

### Simple SVG Support

SVG support is intentionally simple:

- SVGs can be imported and treated as sharp, SVG-backed image layers during normal viewing and transforms
- the app does not support SVG path editing, anchor editing, stroke editing, or boolean ops
- pen strokes on SVG-backed image layers create a separate raster drawing layer above the SVG instead of converting the SVG layer itself
- the bucket fill tool currently skips SVG-backed image layers rather than flattening them in place
- SVG-backed image layers cannot be merged with other layers
- some bitmap-only tools still rely on the existing raster workflow when temporary canvas data is needed for that specific SVG layer
- tool selection alone should not visibly degrade or distort SVG layers; only the actively edited SVG layer should enter the temporary bitmap path during a bitmap-tool interaction

This keeps SVG support compatible with the current architecture without introducing a full vector editing subsystem.

### Bucket Fill MVP Scope

Current bucket fill behavior is intentionally narrow:

- only raster layers and bitmap image layers are supported
- the fill algorithm is contiguous only
- matching is based on seed-pixel RGBA similarity and a user-facing tolerance slider
- each click becomes one committed history step
- non-alpha-locked fills can now expand beyond the old bitmap edge when the contiguous region reaches that edge
- that expansion is still finite and currently stops at the document bounds
- text, shapes, groups, and SVG-backed image layers are out of scope for v1

If future work expands this feature, it should continue to reuse the existing raster surface cache and avoid introducing a second bitmap-editing pipeline.

### Gradient Tool MVP Scope

Current gradient behavior is also intentionally narrow:

- only raster layers and bitmap image layers are supported
- only linear gradients are supported
- available modes are `BG -> FG` and `FG -> Transparent`
- the gradient is applied directly onto the clicked target layer
- non-alpha-locked gradients can now expand the target bitmap when the dragged gradient line extends beyond the old bitmap bounds
- a live overlay preview line appears during the drag, but it is transient UI only and not part of document/export state
- text, shapes, groups, and SVG-backed image layers are out of scope for v1

If future work expands this feature, keep the preview in overlay/transient state and keep the bitmap write path aligned with the existing raster surface cache.

### Selection Behavior

The editor now tries to keep a valid selection whenever layers exist.

That means:

- tool switches should not leave the document with no selected layer
- once a layer is selected in select mode, move-start should come from the visible transformed selection frame rather than requiring another opaque-pixel hit
- lasso startup should preserve the current selected target layer
- opening or creating a new file should rebuild selection from the loaded document state
- invalid saved selection IDs should be treated as recoverable and normalized to a valid fallback layer when possible

One important consequence is that the current `Enter` shortcut does not produce an empty selection when layers exist; selection normalization keeps a valid layer selected.

### Linked Layers

The app now has a lightweight generic linked-layer system in addition to text shadows.

Current behavior:

- any two selected layers can be linked from the inspector
- linked pairs move together during single-layer move gestures
- linked pairs resize together during single-layer resize gestures
- link validity depends on reciprocal references, and project-file normalization clears stale or one-sided links
- deleting one linked layer should leave the remaining layer intact but unlinked

If future work changes transform behavior, keep the linked move/resize path in sync with the normal single-layer interaction path so the pair stays visually coherent.

### Resize Behavior

Resize now depends on a stable pointer-down snapshot:

- size limits during a single drag should be derived from the resize session start state, not from intermediate transient sizes reached mid-drag
- reversing direction during the same drag should remain possible
- the editor now hard-caps resize results at `5000 x 5000`

### Prompt Input

The prompt-style input below the canvas is currently visual-only.

That means:

- it is rendered and styled in the UI
- it does not currently generate content or modify the document
- future work can either wire it into a real flow or remove it cleanly

## Testing Reality

The repo currently relies on:

- build validation
- lint validation
- a focused Vitest unit/component test suite around pure helpers and thin presentational components
- manual behavior testing for the highest-risk editor interaction flows

Current lint baseline remains:

- `npm run lint` passes with the same React hook dependency warnings in `src/App.jsx`

Current automated test scope is intentionally conservative:

- strong coverage around `src/lib/history.js`, `src/hooks/useHistory.js`, `src/lib/layers.js`, `src/lib/documentFiles.js`, `src/lib/textLayer.js`, `src/lib/moveSnapping.js`, `src/lib/viewport.js`, and `src/editor/documentHelpers.js`
- light component coverage around extracted presentational editor components
- no deep tests yet for the pointer lifecycle, raster surface cache behavior, or full `App.jsx` interaction orchestration

Future work on complex editing behavior should assume manual regression risk is real.
