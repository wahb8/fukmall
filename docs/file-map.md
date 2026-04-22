# File Map

This document describes what each tracked file in the repo currently does.

## Root Files

### `package.json`

- project metadata and npm scripts
- declares React 19 and Vite runtime dependencies
- exposes `dev`, `build`, `lint`, `preview`, `test`, `test:watch`, and `test:run`

### `package-lock.json`

- lockfile for deterministic npm installs

### `vite.config.js`

- minimal Vite configuration
- enables the React plugin only
- now also hosts the shared Vitest test configuration and jsdom setup entry

### `eslint.config.js`

- ESLint configuration for the Vite/React project
- ignores `dist/`
- applies the recommended base JS rules plus React Hooks and Vite React Refresh rules for `js`/`jsx` files

### `index.html`

- Vite HTML entry point
- contains the root mount element for React

### `README.md`

- repo-level project README
- explains what the current app is, how to run it, how to run tests, and where to start in the docs

## Test Support

### `src/test/setup.js`

- shared Vitest setup file
- registers `@testing-library/jest-dom` matchers
- provides the shared canvas/text measurement stubs needed by current helper and component tests
- now includes a lazy pixel-aware canvas mock for `fillRect`, `clearRect`, `drawImage`, and `getImageData` so bitmap-oriented tests can assert real sampled pixel results without slowing down the larger App suite

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
- registers the full local font catalog used by the editor UI and text inspector
- sets global background/text defaults
- forces the custom pointer cursor through the whole app

### `src/App.jsx`

- main application component
- main application orchestrator
- owns the persisted light/dark UI theme state and applies it to the app shell through `data-theme`
- restores the last current document from local storage on startup and autosaves document changes back to that storage
- still owns tool state, document state integration, layer rendering, keyboard shortcuts, drag/drop, viewport, and canvas interaction flow
- now delegates several stable render sections into `src/components/editor/`
- creates the default document, including the single seeded background layer used for new files
- the seeded background layer is intentionally oversized slightly beyond the document bounds so it
  bleeds `15px` past each edge while staying centered
- no longer exposes group layers in the seeded document or inspector UI
- contains the unified validated image import path used by direct imports, external desktop drops, and asset-library canvas drops
- contains the trim-transparent-imports runtime preference, persists it separately in `localStorage`, and applies it only to eligible raster imports
- contains the image import sizing and placement logic for both direct imports and asset-library drops
- contains text-shadow creation and shadow-property editing for text layers
- contains generic linked-layer creation/unlinking behavior and the coupled move/resize handling for linked pairs
- now also wires the single-layer inspector flip controls through the existing signed-scale transform model
- contains the text inspector alignment control and the double-click-to-edit wiring for selected text layers
- now resolves text double-click edit entry at the canvas-stage level so an already-selected text layer can enter edit mode from its own transformed frame even when a higher layer overlaps it
- contains the simple SVG-backed image import/render flow, including the behavior that pen strokes on SVG layers create a new raster layer above the SVG
- contains the project file workflow for new/open/save, the new-file and unsaved-changes modal flows, and the runtime reset path used when loading a file
- contains the export controls for flattened PNG/JPEG downloads
- contains the SVG tool-mode render switching logic so SVG layers stay on the normal `<img>` path until a bitmap edit actually starts on that layer
- contains the gradient tool wiring, including mode selection, drag interaction state, and the transient overlay preview line
- contains the bucket fill tool wiring, including toolbar controls, tolerance state, and bitmap-layer fill commits
- contains the asset library panel structure, including the fixed header and scrollable asset list region
- contains the fixed left-side tool layout, zoom-tool reset behavior, and file-menu interactions
- contains the transient top-toolbar status/error state plus the timer and manual-dismiss wiring for
  that pill
- contains a currently unwired prompt-style input below the canvas
- contains move interaction behavior such as snapping and temporary Shift axis locking
- contains the selected-frame move behavior so already-selected layers can be dragged from their transformed selection frame without another opaque-pixel hit
- renders selected-layer chrome outside the per-layer artwork subtree so selection frames and resize handles do not inherit layer artwork opacity
- contains the shared topmost-layer resolver used by single-click selection and as the fallback path for text double-click edit entry after selected-text priority checks
- contains pixel-aware layer picking for raster, image, and text layers, including the current click-through and hit-padding behavior
- contains the outside-canvas deselect behavior that allows an explicit empty selection on pointer down outside the stage
- contains the guard that treats the full right-side inspector/sidebar region as selection-preserving UI so inspector clicks and scrollbar interaction do not clear selection
- contains the inline text-editor caret placement behavior so edit mode opens with the cursor at the end of the text
- contains the current resize-session snapshot logic and the `5000 x 5000` absolute resize cap
- contains both lasso and rectangular marquee transient-selection orchestration, including floating selection extraction and `Sel to Layer`
- contains the fixed-surface raster pen behavior; normal pen drawing no longer expands the raster layer bounds during the stroke
- contains the live document-state ref used by long-lived pointer handlers so paint/edit mapping follows the current layer transform after move operations
- contains the external desktop image-file drag/drop entry path, including supported-file detection, overlay state wiring, and reuse of the direct import flow
- this is currently the most important file in the repo

## Editor-Specific App Modules

### `src/editor/constants.js`

- shared app-level editor constants previously embedded in `App.jsx`
- includes layer size limits, viewport limits, tool defaults, drag MIME type, and selection-handle directions

### `src/editor/documentHelpers.js`

- app-level document/file helpers used by `App.jsx`
- creates the seeded initial document
- the current seeded document is background-only and sizes that background layer `30px` larger than
  the requested document in both dimensions while centering the bleed
- normalizes new-file modal inputs
- sanitizes save/export filename bases
- contains imported-image placement helpers
- contains import-path guards for deciding when transparent-edge trimming is allowed
- contains validated imported-image layer creation so bad sources or dimensions are rejected before a layer is committed
- contains bitmap-patch helpers used when converting editable layers into bitmap-backed variants

### `src/editor/addLayerPanelHelpers.js`

- app-level helper module for the Add Layer panel
- parses and validates pasted JSON payloads for text/image layer creation
- normalizes manual-form values into safe text/image creation specs
- converts normalized specs back into controlled form values
- keeps panel-specific coercion and defaulting out of `App.jsx`
- contains the dedicated exact JSON text-layer creation helper used when JSON text layers must preserve final requested `width` and `height`
- routes explicit text-layer width/height creation through the shared text auto-fit helpers so JSON-created box text keeps its requested box while fitting the font size inside it
- now also recognizes the exact JSON key `"Layer name"` and passes it through as the final created layer name for both JSON-created text and image layers when the provided value is a non-empty trimmed string

### `src/editor/iconAssets.js`

- centralized UI icon resolver used by the editor chrome
- maps each supported UI icon to its normal asset and, when available, its dark-mode white replacement
- falls back to the normal icon automatically when no dark replacement exists
- keeps dark-mode icon swapping explicit instead of scattering theme conditionals across components

## Editor Components

### `src/components/editor/EditorToolbar.jsx`

- presentational toolbar component for tool buttons, tool options, history controls, add-text/add-image actions, and global color controls
- includes the marquee tool button using `src/assets/marquee.svg`
- renders the transient top-toolbar status/error pill and its dismiss button through props
- keeps toolbar UI out of `App.jsx` while leaving the actual behavior callbacks in `App`

### `src/components/editor/FileMenu.jsx`

- presentational file-menu dropdown
- renders the existing new/open/save/export actions through props
- also renders the top-level light/dark UI theme toggle next to the file button
- includes the `Trim Transparent Imports` toggle used by the shared raster import flow

### `src/components/editor/AssetLibraryPanel.jsx`

- presentational asset library sidebar
- renders asset import UI, empty state, drag-start/drag-end wiring, and delete buttons
- now uses valid accessible sibling action buttons for the draggable asset card and its delete control instead of nesting a button inside another button

### `src/components/editor/AddLayerPanel.jsx`

- presentational manual/json layer-creation panel rendered below the asset library
- renders the JSON textarea, inline status, layer-type selector, and text/image form controls
- leaves parsing, validation, async image loading, and document commits to `App.jsx` and editor helpers

### `src/components/editor/ExternalImageDropOverlay.jsx`

- thin presentational overlay for supported external desktop image-file drags
- communicates that dropping a supported image file will import it through the current import flow

### `src/components/editor/LayerPanel.jsx`

- presentational layer stack panel
- renders layer rows, selection interactions, reorder drag/drop wiring, visibility toggles, rename fields, row actions, and add-drawing action
- uses a split panel layout with a dedicated `.layer-list-scroller` region for the rows and a fixed `.layer-panel-footer` for the add-drawing action

### `src/components/editor/LayerFlipControls.jsx`

- presentational inspector control for `Flip Horizontal` and `Flip Vertical`
- keeps the flip-button UI out of `App.jsx` while leaving document mutation and history wiring in `App`

### `src/components/editor/PromptShell.jsx`

- presentational wrapper around the currently unwired prompt-style input below the canvas

### `src/components/editor/modals/NewFileModal.jsx`

- presentational modal for document name, width, and height entry

### `src/components/editor/modals/UnsavedChangesModal.jsx`

- presentational confirmation modal shown before creating a new file with dirty state

## Test Files

### `src/lib/*.test.js`

- unit tests for the pure helper/domain modules
- current coverage includes history, layers, document-file normalization, text helpers, snapping, and viewport math
- `layers.test.js` now also covers the shared horizontal/vertical flip helpers

### `src/hooks/useHistory.test.jsx`

- focused hook test coverage for transient updates, transient commits, and reset behavior

### `src/editor/documentHelpers.test.js`

- unit tests for seeded document creation, new-file normalization, filename sanitization, import placement, and bitmap patch helpers

### `src/editor/addLayerPanelHelpers.test.js`

- unit tests for Add Layer JSON parsing, invalid JSON handling, default fallbacks, text/image spec normalization, and JSON `"Layer name"` behavior for both text and image specs

### `src/components/editor/*.test.jsx`

- light React Testing Library coverage for stable presentational editor components
- current coverage includes the toolbar, file menu, prompt shell, and modal components
- `FileMenu.test.jsx` includes basic prop-surface coverage for the theme-aware file menu
- `AddLayerPanel.test.jsx` covers panel rendering and basic callback wiring for text/image modes
- `LayerPanel.test.jsx` covers the dedicated scroll container, fixed footer add button, and preserved row callback wiring after the panel layout split

### `src/App.addLayerJson.test.jsx`

- App-level integration coverage for the live Add Layer JSON flow
- verifies both `Create From JSON` and `Apply JSON -> Create Layer` runtime paths
- verifies inspector-preserving selection behavior inside the right-side inspector panel
- now also verifies that JSON-created text layers surface the provided `"Layer name"` at runtime
- now also verifies that JSON-created text can come in already auto-fitted to the requested box size

### `src/App.imageImport.test.jsx`

- App-level regression coverage for direct import, external desktop drop, asset-library drop, SVG import, and failed image import handling
- verifies the shared validated import path and trim-aware image-layer creation behavior

### `src/App.resizeHandles.test.jsx`

- App-level regression coverage for selected-frame interaction and selection chrome structure
- verifies that the visible single-layer selection frame is not rendered inside the opacity-applied artwork subtree
- now also includes a resize regression that verifies a newly auto-fit text box can enlarge and then
  shrink on the next drag without collapsing prematurely to the minimum fitted size

### `src/App.css`

- primary styling file for the entire editor
- defines colors, layout, panels, stage, controls, selection frames, responsive behavior, and visual language
- includes the capped layer-panel scroller so the layer rows scroll internally while the footer action remains fixed
- defines both the default light-theme CSS variables and the dark-theme overrides applied through `.app-shell[data-theme='dark']`
- contains the scoped native custom scrollbar styling for `.asset-panel-body`, `.add-layer-panel-body`, `.inspector-panel-body`, and `.layer-list-scroller`
- keeps scrollbar customization CSS-only through `scrollbar-width` / `scrollbar-color` plus `::-webkit-scrollbar` rules instead of replacing native scrolling
- styles the new-file and unsaved-changes modal surfaces
- constrains the asset library panel height and makes the thumbnail region scroll independently from the header
- constrains the Add Layer panel height and gives it its own internal scroll region below the asset library
- controls the masonry-like asset card layout and the asset delete button placement
- styles the file menu dropdown, active asset-drop canvas state, shared multi-selection frame, inline text editor, and the prompt shell below the canvas
- styles the transient top-toolbar status/error pill and its corner-mounted dismiss button
- makes the single-layer selection frame interactive so it can act as the move region for already-selected layers
- styles the selection overlay path so visible selection chrome stays independent from layer artwork opacity
- styles the segmented alignment control and linked-layer controls in the inspector

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
- still retains the internal `createGroupLayer()` helper for later work, even though group layers are disabled in the current product
- image layers now carry source metadata such as `sourceKind`
- normalizes reciprocal linked-layer references
- handles selection, append/insert/remove, duplication, generic layer linking/unlinking, move, merge-down support, SVG merge restrictions, linked text-shadow cleanup, and alpha-lock helpers

### `src/lib/raster.js`

- low-level canvas and image helpers
- creates sized canvases
- loads image sources into canvases
- resolves image dimensions from normal image sources and SVG sources
- detects SVG-backed image sources and extracts intrinsic SVG dimensions from `width`, `height`, and `viewBox`
- decodes inline/data-URL SVG markup before sizing when needed
- can rasterize image sources to an explicit target canvas size when the editor needs a higher-resolution working surface
- clones/crops canvases
- serializes canvases to data URLs
- contains the transparent-edge trim helpers used by import flows, including alpha-bounds detection and padded canvas cropping
- applies erase/mask composition
- contains the linear gradient bitmap helper used by the gradient tool
- contains the contiguous flood-fill helper used by the bucket tool
- contains text-canvas composition helpers for editable text, erase masks, and paint overlays
- now uses the shared mixed-style text measurement/render path when rasterizing text layers to canvas
- converts DOM pointer positions into canvas-local coordinates
- includes canvas alpha-sampling helpers used by pixel-aware selection hit testing, including nearby-pixel hit padding

### `src/lib/exportDocument.js`

- renders the current document into an offscreen export canvas
- flattens visible layers in stack order
- current exports only render active user-facing layer types; disabled group layers are not part of the export path
- supports PNG and JPEG downloads
- reuses text mask/overlay composition so exported artwork matches the editor view

### `src/lib/documentFiles.js`

- serializes and validates `.kryop` project files
- normalizes loaded document state
- stores and restores the current working document in `localStorage` through `fukmall.current-document`
- strips disabled group layers during normalization so they do not re-enter the UI through saved files
- repairs invalid saved selection state by falling back to the last valid layer when possible
- repairs invalid linked-layer references by keeping only valid reciprocal pairs
- downloads project files with app metadata and format versioning

### `src/lib/textLayer.js`

- current text system
- measures text, wraps box text, syncs text layout into layer bounds, updates text style/content, normalizes partial-style ranges, and renders text to canvas
- defaults new text layers to box mode with `Arial, sans-serif`, left alignment, `1.15` line height, and `0` letter spacing
- now owns the box-text auto-fit model and bounded font-size search used by resize-driven and JSON-driven text fitting
- box-text auto-fit now also iterates against the effective usable wrap width after font-specific
  glyph overflow padding is known, instead of wrapping against the raw box width and rejecting some
  fonts only after the measurement step
- now owns the `styleRanges` normalization and text-change remapping helpers used by partial text styling
- now resolves partial-style text into styled runs so measurement, wrapping, alignment, and canvas rendering stay in sync
- preserves point-text horizontal anchors across content/alignment updates
- now preserves the correct left/center/right point-text anchor semantics when alignment changes
- now extends style ranges correctly when text is inserted at a styled boundary
- now keeps explicit selected-range style resets when a subrange intentionally overrides a broader parent style with a base-looking value
- now splits mixed-style render runs at whitespace boundaries as well as style boundaries so run-based rendering matches the current expectations more closely
- applies left/center/right alignment in both normal line rendering and letter-spaced glyph rendering
- now also supports an exact JSON box-size preservation flag used by JSON-created text layers so later layout sync does not overwrite requested final `width` and `height`
- box text auto-fit reuses that same shared measurement/render path, scaling styled range font sizes proportionally instead of introducing a second renderer
- keeps auto-fit source font/style data stable across later content/style edits so resize-driven
  fitting continues to solve from the authored baseline instead of accumulating previous fitted sizes

### `src/App.autoFitFontRegression.test.jsx`

- App-level regression coverage for the font-sensitive auto-fit box-text path
- uses a font-aware canvas measurement stub so different font families expose different horizontal
  metrics during the test run
- verifies initial creation bounds, slight shrink behavior, later grow recovery, and selection-frame
  sync for `Arial`, `Cairo`, `Ubuntu`, and `Georgia`

### `src/lib/penTool.js`

- stroke smoothing and brush drawing helpers
- applies low-pass and Chaikin-style smoothing
- provides drag thresholds and minimum point spacing
- draws both single-point dots and smoothed multi-point brush strokes

### `src/lib/eraserTool.js`

- primitive eraser/mask brush operations
- supports both destructive erase on raster/image layers and mask painting for text layers
- implements both line strokes and single-click dots with round caps

### `src/lib/lassoTool.js`

- polygon/lasso selection helpers
- computes bounds, extracts selected pixels to a floating canvas, clears selected regions, and renders selection outlines
- can convert lassoed content into a movable floating-selection object

### `src/lib/rectSelectTool.js`

- rectangular marquee selection helpers
- normalizes dragged rectangle geometry
- extracts and clears rectangular pixel regions
- renders the marquee overlay and shared rectangular clip behavior

### `src/lib/moveSnapping.js`

- movement snapping helper
- snaps to document center and outer edges
- supports axis-specific snapping enablement so constrained movement can snap only on the active axis
- returns guide visibility flags for overlay rendering

### `src/lib/viewport.js`

- viewport math helpers
- converts between world/document coordinates and screen coordinates
- clamps zoom between configured minimum and maximum values
- handles zooming around a given screen point

### `src/lib/colors.js`

- stores global foreground/background colors
- persists the pair in `localStorage`
- uses the storage key `fukmall.global-colors`

### `src/lib/fontOptions.js`

- exports the list of font-family options shown in the text inspector
- includes both bundled local fonts and fallback system fonts

### `src/lib/textObject.js`

- older generic text object helper
- can create, render, scale, and bake text transforms
- appears to be a legacy or unused module in the current app flow

## Source Assets

### `src/assets/hero.png`

- leftover demo image asset from earlier seeded-document iterations

### `src/assets/BadeenDisplay-Regular.ttf`

- standalone bundled font file registered from `src/index.css`

### `src/assets/fonts/Fixture-Black.ttf`

- local display font used by the UI font-face definition

### `src/assets/fonts/*.ttf`

- bundled local font catalog used by the UI font registration in `src/index.css`
- also provides most of the font-family options exposed to text layers through `src/lib/fontOptions.js`

### `src/assets/illustration styles/**/*`

- reference/demo image catalog grouped by illustration style
- used as source assets available to the current workspace rather than runtime code modules

### `src/assets/add layer.svg`

- layer-panel add-drawing icon

### `src/assets/gradient.svg`

- toolbar/icon asset for the gradient tool

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

### `src/assets/marquee.svg`

- rectangular marquee tool icon

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
