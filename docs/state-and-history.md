# State and History

## State Categories

The app uses several different categories of state inside `src/App.jsx`.

### 1. Persistent Document State

Managed through `useHistory`, this is the state that participates in undo/redo:

- document name and dimensions
- document layers
- selection state in the document object

### 2. Transient UI State

Stored in normal React state and not part of undo history:

- open/closed inspector
- new-file and unsaved-changes modal state
- auth modal state on the landing and pricing pages
- active tool
- current UI theme
- pen and eraser size
- lasso/floating selection objects
- rectangular marquee/floating-rect selection objects
- asset library
- drag UI state
- viewport
- snap guides
- file-menu open state
- open/export busy flags
- saved-document signature used for dirty-state tracking
- first-entry empty-canvas UI state in `/app`

Opening a file or creating a new file should clear this transient state and rebuild it from the new document context instead of trying to preserve the old runtime session.

### 3. Imperative Refs

Refs are used for mutable runtime objects that should not trigger rerenders:

- DOM elements
- in-progress interaction metadata
- raster surface cache map
- a live ref of the current document state used by long-lived pointer handlers so edit mapping does not use stale pre-move layer geometry
- copied layer buffer
- last editable pen layer
- hidden file/input refs and drag-preview image refs
- auth modal reset/login view is local React state, not a document or history concern

The active interaction object can also carry temporary movement metadata such as:

- Shift axis-lock state
- the axis chosen for the current constrained drag
- temporary pointer/position anchors used to determine the lock direction

## Document Shape

The document shape is intentionally minimal:

```js
{
  name: 'Untitled',
  width: 1080,
  height: 1440,
  layers: [],
  selectedLayerId: null,
  selectedLayerIds: []
}
```

Order in `layers` is the visual stack order.

Image layers may also carry source metadata such as:

- `sourceKind`

This is used to distinguish normal bitmap-backed image layers from SVG-backed image layers.

Layers may also carry `linkedLayerId` when they are part of a mutual two-layer link.

Group layer data may still exist in older code paths or project files, but normalization currently
filters those layers out before they enter active editor state.

## History Model

History is a standard three-part snapshot stack:

```js
{
  past: [],
  present: currentDocument,
  future: []
}
```

The history hook also supports resetting the entire stack when the user creates a new file or opens an existing project file.

### Committed Changes

`commit()` pushes a new snapshot into history and clears redo state.

Used for:

- creating/removing layers
- finalized paint/erase operations
- finalized text/image/layer edits
- paste/duplicate/merge operations

### Transient Changes

`setTransient()` updates the current `present` state without pushing history.

Used for:

- drag previews
- resize previews
- in-progress edits that should not create dozens of undo steps

### Committing a Transient Interaction

`commitTransientChange(previousState)` pushes the previous snapshot after a transient interaction has finished.

This is how drag/resize gestures typically become a single undoable step.

## Raster Surface Cache

The document stores serialized bitmaps, but the app renders and edits through live canvas surfaces.

Each erasable layer may have a cache entry with:

- `offscreenCanvas`
- `maskCanvas`
- `paintOverlayCanvas`
- `visibleCanvas`
- `layerElement`
- `bitmapKey`
- `syncToken`

### Why This Exists

Without this cache, every pointer move would require:

- reserializing canvas data
- rewriting React state
- rerendering more of the app than necessary

The cache lets the app draw immediately and only persist the final result when the gesture ends.

For raster pen drawing, the cache now assumes a stable surface model:

- the working canvas matches the layer's current bitmap size
- pen drawing is clipped to that fixed surface instead of expanding it during the gesture
- layer geometry stays stable unless some explicit non-pen workflow changes it

For SVG-backed image layers, the cache is also the bridge into bitmap-only tools:

- normal display can stay SVG-backed and sharp
- some bitmap-oriented operations can rasterize the SVG into a temporary canvas workflow only when needed
- pen drawing is special-cased: starting a pen stroke on an SVG layer creates a new raster drawing layer above the SVG instead of converting that SVG layer
- cache keys for SVG-backed layers depend on the current effective raster surface size so resized/scaled SVGs invalidate stale low-resolution surfaces
- the app also keeps temporary UI state that tracks which SVG layer, if any, is currently in an active bitmap-tool interaction

## Text-Specific State Model

Text layers are more complex than other layer types.

They combine:

- structured text properties
- optional box-text `autoFit` state
- normalized `styleRanges` data for partial text styling overrides
- an optional erase mask bitmap
- an optional paint overlay bitmap
- measured layout fields such as `measuredWidth` and `measuredHeight`
- alignment state through `textAlign`

This allows the app to keep text editable while still supporting paint and erase operations on top of it.

Point text also now preserves its horizontal anchor when content or alignment changes:

- `left` keeps the anchor at the left edge
- `center` keeps the anchor at the visual midpoint
- `right` keeps the anchor at the right edge

Current partial-style behavior is intentionally data-first:

- selected-range font/color/weight-style changes can now write normalized `styleRanges`
- style ranges are normalized to avoid redundant overlap and to merge adjacent identical spans
- undo/redo and project-file save/load include these ranges because they live in the document snapshot
- measurement, wrapping, bounds, editor rendering, and export now all consume the same run-based text layout derived from these ranges
- when box-text auto-fit is enabled, that same run-based path scales the stored text styles to the current fitted font size instead of switching to a separate renderer
- the box-text fit solve now also derives its usable wrap width from that same font-sensitive
  measurement path, so different font families do not drift into different shrink/grow behavior

## Selection State

There are several related selection concepts:

### Layer Selection

- single and multi-selection stored in the document
- when layers exist, the app now tries to keep a valid selected layer rather than allowing the editor to drift into an empty-selection state
- project-file normalization also repairs invalid saved selection IDs by falling back to the last remaining layer when possible
- visible selection frames, bounds lines, and resize handles are transient editor overlay chrome rather than persistent layer content

### Linked Layer State

- two layers can be linked through reciprocal `linkedLayerId` fields
- the link is normalized on file load so one-sided or self-links are cleared
- linked text-shadow pairs use this same relationship model

### Lasso Selection

- polygon points and bounds for a selected region within a source layer

### Rectangular Marquee Selection

- a transient rectangle tied to a source layer
- can become a floating pixel selection before being committed or cleared
- is not stored in the persistent document snapshot

### Floating Selection

- extracted canvas content that can be moved independently before being committed/deleted

These are separate because lasso/floating selection and rectangular marquee state are pixel-region state, not just layer selection state.

## Empty-Canvas Entry State

The first time a user enters `/app` without a restored document, the editor can show a UI-only
empty-canvas prompt.

This state is intentionally not part of the document snapshot:

- it does not change canvas dimensions
- it does not create a history entry
- it does not persist after a file is opened or created
- clicking the prompt or the canvas in that state reuses the existing New File flow

## Important Consequences

### Benefits

- interactions feel immediate
- paint tools do not spam history
- document model stays relatively compact

### Tradeoffs

- a lot of logic depends on synchronization between React state and mutable refs
- async surface generation can race if multiple updates happen quickly
- the boundary between document truth and render cache truth is subtle
- selection is now split across several layers of behavior: document selection IDs, transient lasso/marquee pixel-region state, and pixel-aware topmost-visible-layer hit testing
- raster pen drawing now follows a simpler fixed-surface model, but bitmap tools such as bucket fill and gradient can still allocate larger temporary working surfaces when the operation requires it
- SVG-backed image layers now have a mixed render model: normal display can stay vector-backed, while some bitmap workflows use temporary raster surfaces and pen drawing creates separate raster layers above the SVG
- SVG-backed layers now also have tool-mode switching behavior: normal tool selection alone should not swap them into the temporary raster path, only active editing should

Any future feature that touches paint, masks, text rendering, or lasso behavior needs to respect this split.

## Project Files

The editor now supports simple project-file persistence.

Current file model:

- files are saved as `.kryop`
- files store app metadata, a format version, and the serialized document only
- document normalization currently removes disabled group layers during load/save normalization
- file normalization also rebuilds valid single/multi-selection state when saved IDs are stale
- file normalization also repairs invalid linked-layer references by keeping only reciprocal valid pairs
- undo/redo history is intentionally not stored in v1
- runtime-only refs and raster caches are rebuilt after load instead of being serialized

Separate local UI persistence also exists outside the project-file format:

- the current working document is also autosaved in `localStorage` under `fukmall.current-document`
- UI theme is stored in `localStorage` under `fukmall.theme`
- the raster-import trim preference is stored separately in `localStorage` under `fukmall.trim-transparent-imports`
- foreground/background colors are stored separately from the document model
- opening a project should not overwrite the current chrome theme
- autosave failures are handled as transient runtime UI errors rather than mutating the document model or crashing the app
