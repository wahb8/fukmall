# State and History

## State Categories

The app uses several different categories of state inside `src/App.jsx`.

### 1. Persistent Document State

Managed through `useHistory`, this is the state that participates in undo/redo:

- document layers
- selection state in the document object

### 2. Transient UI State

Stored in normal React state and not part of undo history:

- open/closed inspector
- active tool
- pen and eraser size
- lasso/floating selection objects
- asset library
- drag UI state
- viewport
- snap guides
- toolbar side placement
- file-menu open state
- open/export busy flags

Opening a file or creating a new file should clear this transient state and rebuild it from the new document context instead of trying to preserve the old runtime session.

### 3. Imperative Refs

Refs are used for mutable runtime objects that should not trigger rerenders:

- DOM elements
- in-progress interaction metadata
- raster surface cache map
- copied layer buffer
- last editable pen layer
- hidden file/input refs and drag-preview image refs

The active interaction object can also carry temporary movement metadata such as:

- Shift axis-lock state
- the axis chosen for the current constrained drag
- temporary pointer/position anchors used to determine the lock direction

## Document Shape

The document shape is intentionally minimal:

```js
{
  layers: [],
  selectedLayerId: null,
  selectedLayerIds: []
}
```

Order in `layers` is the visual stack order.

Image layers may also carry source metadata such as:

- `sourceKind`

This is used to distinguish normal bitmap-backed image layers from SVG-backed image layers.

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
- an optional erase mask bitmap
- an optional paint overlay bitmap
- measured layout fields such as `measuredWidth` and `measuredHeight`

This allows the app to keep text editable while still supporting paint and erase operations on top of it.

## Selection State

There are several related selection concepts:

### Layer Selection

- single and multi-selection stored in the document
- when layers exist, the app now tries to keep a valid selected layer rather than allowing the editor to drift into an empty-selection state
- project-file normalization also repairs invalid saved selection IDs by falling back to the last remaining layer when possible

### Lasso Selection

- polygon points and bounds for a selected region within a source layer

### Floating Selection

- extracted canvas content that can be moved independently before being committed/deleted

These are separate because lasso/floating selection is pixel-region state, not just layer selection state.

## Important Consequences

### Benefits

- interactions feel immediate
- paint tools do not spam history
- document model stays relatively compact

### Tradeoffs

- a lot of logic depends on synchronization between React state and mutable refs
- async surface generation can race if multiple updates happen quickly
- the boundary between document truth and render cache truth is subtle
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
- undo/redo history is intentionally not stored in v1
- runtime-only refs and raster caches are rebuilt after load instead of being serialized
