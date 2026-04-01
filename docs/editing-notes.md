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

### The Repo Is Mid-Evolution

There are signs of active expansion:

- newer modules such as `colors`, `lassoTool`, `moveSnapping`, `textLayer`, and `viewport`
- leftover starter files such as the default `README.md`, `react.svg`, and `vite.svg`
- a legacy-looking `textObject.js` helper

This is a normal state for a prototype, but it means code style and ownership boundaries are not fully settled yet.

## Recommended Edit Strategy

Prefer this order when making changes:

1. update or add pure helper logic in `src/lib/`
2. keep document mutations in `src/lib/layers.js`
3. keep rendering math in `src/lib/raster.js`, `src/lib/textLayer.js`, or `src/lib/viewport.js`
4. only then wire the feature into `src/App.jsx`

This keeps `App` from getting even more overloaded.

## Best Refactor Opportunities

If the app continues growing, the best extractions are:

- a `CanvasStage` component
- a `LayerInspector` component
- a `LayerList` component
- a `useCanvasInteractions` hook
- a `useRasterSurfaceCache` hook
- a dedicated document context/store if multi-file coordination grows

## Known Gaps or MVP Behavior

### Document Persistence

The app now supports simple project-file persistence.

Current behavior:

- full documents can be saved and reopened through `.kryop` project files
- only the current document is saved in v1, not the full undo/redo stack
- global colors are still persisted separately in `localStorage`
- runtime-only editor state such as live canvas caches, refs, lasso/floating selections, and drag state should continue to be treated as non-persistent

### Group Layers

Groups are visual placeholders, not real nested containers.

### Default New File State

Fresh documents now start with a full-canvas white background layer at the bottom of the stack.

### Text Paint Remapping

Paint overlay on text layers does not intelligently remap when text content/font changes significantly.

### History Scaling

History stores full state snapshots, not patches.

This is acceptable for an MVP but may become expensive for larger documents or persistent storage.

### Import Behavior

Imported images now preserve their intrinsic dimensions by default.

The current import rules are:

- no automatic shrink-to-fit step for normal image imports
- no automatic shrink-to-fit step for asset-library drops
- default placement is clamped into the document bounds so large images do not land partly off-canvas

If future work adds optional "fit to canvas" behavior, it should be an explicit user-facing action rather than the default import path.

### Simple SVG Support

SVG support is intentionally simple:

- SVGs can be imported and treated as sharp, SVG-backed image layers during normal viewing and transforms
- the app does not support SVG path editing, anchor editing, stroke editing, or boolean ops
- pen strokes on SVG-backed image layers create a separate raster drawing layer above the SVG instead of converting the SVG layer itself
- SVG-backed image layers cannot be merged with other layers
- some bitmap-only tools still rely on the existing raster workflow when temporary canvas data is needed for that specific SVG layer
- tool selection alone should not visibly degrade or distort SVG layers; only the actively edited SVG layer should enter the temporary bitmap path during a bitmap-tool interaction

This keeps SVG support compatible with the current architecture without introducing a full vector editing subsystem.

### Selection Behavior

The editor now tries to keep a valid selection whenever layers exist.

That means:

- tool switches should not leave the document with no selected layer
- lasso startup should preserve the current selected target layer
- opening or creating a new file should rebuild selection from the loaded document state

## Testing Reality

The repo currently relies on:

- build validation
- lint validation
- manual behavior testing

There are no automated unit, integration, or end-to-end tests in the current codebase.

Future work on complex editing behavior should assume manual regression risk is real.
