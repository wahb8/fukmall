# Overall Architecture

## Summary

This app is a client-side React + Vite editor prototype for building and editing a layered mobile-sized composition. It behaves like a lightweight design tool with a document model, layer stack, editable text, raster painting, gradient application, bucket fill, erasing, lasso selection, snapping, zooming, and an asset library.

The architecture is simple in packaging but dense in implementation:

- React renders the full editor UI.
- A single large component in `src/App.jsx` orchestrates nearly all product behavior.
- Small utility modules in `src/lib/` handle data transforms, canvas operations, tool math, and document helpers.
- Undo/redo is snapshot-based.
- Raster and text surfaces are cached in memory using `canvas` elements stored in refs.
- The app now supports flattened image export and simple file-based project save/open workflows.

## Runtime Layers

### 1. App Shell

`src/main.jsx` mounts the app and imports global CSS.

`src/App.jsx` is the actual product shell. It owns:

- top bar and sidebars
- canvas viewport and stage
- tool switching
- selection and interaction flow
- keyboard shortcuts
- layer inspector
- asset library import/drag-drop
- project-file open/save/new actions
- flattened export actions
- document edits and history commits
- synchronization between persistent document state and temporary canvas surfaces

### 2. Document Model

The document model lives in `src/lib/layers.js`.

The document currently contains:

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

Layer-specific fields are then added for `shape`, `image`, `raster`, `text`, and `group`.

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
- a sync token and bitmap key

That cache allows the UI to repaint quickly without rewriting the persisted document object on every pointer move.

### 5. Tool Modules

Feature logic is split into focused helper modules:

- `penTool.js`: smooth stroke generation and brush behavior
- `eraserTool.js`: erase/mask drawing ops
- `raster.js`: also hosts the gradient and bucket-fill bitmap implementations used for bitmap layers
- `lassoTool.js`: polygon selection and floating selection extraction
- `moveSnapping.js`: snapping to frame center and edges
- `viewport.js`: screen/world coordinate transforms
- `textLayer.js`: text measurement, wrapping, layout sync, and canvas rendering
- `colors.js`: global foreground/background storage

## Data Flow

The main data flow for most interactions is:

1. User input starts in `App`.
2. `App` resolves the active layer/tool and pointer coordinates.
3. A transient interaction object is stored in `interactionRef`.
4. Pointer move events update either:
   - transient document state via `setTransient`, or
   - in-memory canvases via `rasterSurfacesRef`, or
   - transient overlay state such as the gradient preview line
5. Pointer up finalizes the result.
6. The result is committed into document history with `commit` or `commitTransientChange`.

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

## Current Extension Seams

The safest places to add behavior are:

- `src/lib/layers.js` for document mutations
- `src/lib/textLayer.js` for text-specific behavior
- `src/lib/raster.js` for bitmap/canvas helpers
- `src/lib/moveSnapping.js` for snapping logic
- extracted subcomponents/hooks if `src/App.jsx` starts being broken apart

The riskiest place to edit directly is the middle of `src/App.jsx` pointer handling, because many tool behaviors share the same event lifecycle.
