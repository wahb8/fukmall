# File Map

This document describes what each tracked file in the repo currently does.

## Root Files

### `package.json`

- project metadata and npm scripts
- declares React 19 and Vite runtime dependencies
- exposes `dev`, `build`, `lint`, and `preview`

### `package-lock.json`

- lockfile for deterministic npm installs

### `vite.config.js`

- minimal Vite configuration
- enables the React plugin only

### `eslint.config.js`

- ESLint configuration for the Vite/React project

### `index.html`

- Vite HTML entry point
- contains the root mount element for React

### `README.md`

- default Vite starter README
- does not document the current app behavior

## Public Assets

### `public/favicon.svg`

- browser tab icon asset

### `public/icons.svg`

- static SVG sprite/icon asset file

## App Entry

### `src/main.jsx`

- imports global CSS
- mounts `App` into `#root`
- wraps the app in `StrictMode`

### `src/index.css`

- very small global stylesheet
- registers the `Fixture` font face from local assets
- sets global background/text defaults
- forces the custom pointer cursor through the whole app

### `src/App.jsx`

- main application component
- owns editor UI, tool state, document state integration, layer rendering, keyboard shortcuts, drag/drop, viewport, and canvas interaction flow
- creates the default document, including the full-canvas white background layer used for new files
- contains the image import sizing and placement logic for both direct imports and asset-library drops
- contains the simple SVG-backed image import/render flow, including the behavior that pen strokes on SVG layers create a new raster layer above the SVG
- contains the project file workflow for new/open/save and the runtime reset path used when loading a file
- contains the export controls for flattened PNG/JPEG downloads
- contains the SVG tool-mode render switching logic so SVG layers stay on the normal `<img>` path until a bitmap edit actually starts on that layer
- contains the gradient tool wiring, including mode selection, drag interaction state, and the transient overlay preview line
- contains the bucket fill tool wiring, including toolbar controls, tolerance state, and bitmap-layer fill commits
- contains the asset library panel structure, including the fixed header and scrollable asset list region
- contains move interaction behavior such as snapping and temporary Shift axis locking
- this is currently the most important file in the repo

### `src/App.css`

- primary styling file for the entire editor
- defines colors, layout, panels, stage, controls, selection frames, responsive behavior, and visual language
- constrains the asset library panel height and makes the thumbnail region scroll independently from the header
- controls the masonry-like asset card layout and the asset delete button placement

## Hooks

### `src/hooks/useHistory.js`

- React hook wrapper around the plain history helpers
- exposes committed updates, transient updates, undo, redo, reset, and booleans for UI state

## Library Modules

### `src/lib/history.js`

- pure history helpers
- creates history state
- applies committed changes
- supports undo/redo and availability checks

### `src/lib/layers.js`

- document and layer model helpers
- creates each layer type
- image layers now carry source metadata such as `sourceKind`
- handles selection, append/insert/remove, duplication, move, merge-down support, SVG merge restrictions, and alpha-lock helpers

### `src/lib/raster.js`

- low-level canvas and image helpers
- creates sized canvases
- loads image sources into canvases
- resolves image dimensions from normal image sources and SVG sources
- detects SVG-backed image sources and extracts intrinsic SVG dimensions from `width`, `height`, and `viewBox`
- can rasterize image sources to an explicit target canvas size when the editor needs a higher-resolution working surface
- clones/crops canvases
- serializes canvases to data URLs
- applies erase/mask composition
- contains the linear gradient bitmap helper used by the gradient tool
- contains the contiguous flood-fill helper used by the bucket tool
- converts DOM pointer positions into canvas-local coordinates

### `src/lib/exportDocument.js`

- renders the current document into an offscreen export canvas
- flattens visible layers in stack order
- supports PNG and JPEG downloads
- reuses text mask/overlay composition so exported artwork matches the editor view

### `src/lib/documentFiles.js`

- serializes and validates `.kryop` project files
- normalizes loaded document state
- downloads project files with app metadata and format versioning

### `src/lib/textLayer.js`

- current text system
- measures text, wraps box text, syncs text layout into layer bounds, updates text style/content, and renders text to canvas

### `src/lib/penTool.js`

- stroke smoothing and brush drawing helpers
- applies low-pass and Chaikin-style smoothing
- provides drag thresholds and minimum point spacing

### `src/lib/eraserTool.js`

- primitive eraser/mask brush operations
- supports both destructive erase on raster/image layers and mask painting for text layers

### `src/lib/lassoTool.js`

- polygon/lasso selection helpers
- computes bounds, extracts selected pixels to a floating canvas, clears selected regions, and renders selection outlines

### `src/lib/moveSnapping.js`

- movement snapping helper
- snaps to document center and outer edges
- supports axis-specific snapping enablement so constrained movement can snap only on the active axis
- returns guide visibility flags for overlay rendering

### `src/lib/viewport.js`

- viewport math helpers
- converts between world/document coordinates and screen coordinates
- handles zooming around a given screen point

### `src/lib/colors.js`

- stores global foreground/background colors
- persists the pair in `localStorage`

### `src/lib/fontOptions.js`

- exports the list of font-family options shown in the text inspector

### `src/lib/textObject.js`

- older generic text object helper
- can create, render, scale, and bake text transforms
- appears to be a legacy or unused module in the current app flow

## Source Assets

### `src/assets/hero.png`

- demo image used in the initial document

### `src/assets/fonts/Fixture-Black.ttf`

- local display font used by the UI font-face definition

### `src/assets/add image.svg`

- toolbar/icon asset for image insertion

### `src/assets/add text.svg`

- toolbar/icon asset for text insertion

### `src/assets/bucket.svg`

- toolbar/icon asset for the bucket fill tool

### `src/assets/Close (X).svg`

- close/delete icon

### `src/assets/down.svg`

- move layer down icon

### `src/assets/duplicate.svg`

- duplicate layer icon

### `src/assets/eraser.svg`

- eraser tool icon

### `src/assets/Hidden.svg`

- layer visibility-off icon

### `src/assets/lasso.svg`

- lasso tool icon

### `src/assets/merge down.svg`

- merge-layer-down icon

### `src/assets/pen.svg`

- pen/paint tool icon

### `src/assets/pointer.svg`

- custom cursor asset

### `src/assets/react.svg`

- leftover starter asset; not part of the current editor feature set

### `src/assets/redo.svg`

- redo icon

### `src/assets/undo.svg`

- undo icon

### `src/assets/up.svg`

- move layer up icon

### `src/assets/Visible.svg`

- layer visibility-on icon

### `src/assets/vite.svg`

- leftover starter asset; not part of the current editor feature set

### `src/assets/zoom.svg`

- zoom control icon
