# Feature-Level Details

## Initial Document

On startup, the app creates a demo composition instead of loading external data.

The initial document includes:

- a full-canvas white background layer
- a hero image layer
- an orange rounded rectangle shape layer
- an editable text layer

This seed data is created inside `src/App.jsx` through `createInitialDocument()`.

## Layer Types

### Shape Layers

- simple rounded rectangles
- editable fill color and corner radius
- rendered directly with normal DOM styling/canvas merge logic

### Image Layers

- use a `src`/`bitmap` data URL or image URL
- can be resized, moved, duplicated, and alpha locked
- support painting and erasing inside the image frame
- direct imports currently come through an `image/*` file picker
- direct image imports now preserve the source image's intrinsic dimensions by default
- asset-library drops now use the same intrinsic-dimension behavior
- imported image layers continue to use `scaleX: 1` and `scaleY: 1` unless the user resizes them later

### SVG-Backed Images

- SVG files are supported in the main import flow and the asset library flow
- imported SVGs remain SVG-backed by default for normal viewing and transform operations
- SVG-backed image layers render sharply through the browser image/SVG path instead of being flattened immediately for normal display
- SVG-backed layers still support normal layer actions such as move, resize, duplicate, reorder, selection, snapping, and undo/redo
- selecting a bitmap tool does not immediately force all SVG layers onto a temporary raster path
- drawing with the pen tool on an SVG layer creates a new raster drawing layer above the SVG and paints there instead of converting the SVG layer itself
- the bucket fill tool currently does not operate on SVG-backed image layers in v1
- SVG layers do not merge down with any other layer
- erase and other bitmap-only workflows may still use temporary raster surfaces when that specific SVG layer is actively being edited
- intrinsic SVG sizing is resolved from `width`/`height` or `viewBox` when possible
- temporary SVG raster surfaces are sized from the current displayed box and current scale so scaled-up SVGs do not reuse stale low-resolution surfaces

### Imported Image Placement

- direct image import places the image centered within the `1080 x 1440` document when possible
- asset-library drop places the image around the drop point
- if an imported image would land partly outside the document, its position is clamped back into bounds
- this keeps large imports, including full-canvas `1080 x 1440` images, from appearing incorrectly offset

### Raster Layers

- used as freehand drawing layers
- can be auto-created when the pen tool needs a drawable target
- persisted as PNG data URLs
- support alpha lock
- raster pen editing no longer auto-crops the layer to the first painted alpha bounds on commit
- raster pen strokes can expand the working surface when the user paints past the current edge
- during that expansion, the on-canvas preview stays visually anchored instead of making the layer jump or chase the brush

### Text Layers

- text remains editable as structured text, not flattened by default
- support point text and box text modes
- new text layers default to box mode
- support font family, size, weight, color, wrapping, letter spacing, line height, and text alignment
- support `left`, `center`, and `right` alignment as a real text-layer property
- for box text, alignment positions each wrapped line inside the text box
- for point text, alignment changes the horizontal anchor behavior:
  left extends rightward from the anchor, center stays centered on the anchor, and right extends leftward from the anchor
- erasing is stored as a mask bitmap
- painting is stored in a separate overlay bitmap so text content can still be edited later

### Text Shadows

- text layers can create a linked shadow layer from the inspector
- the shadow copies the source text content and typography settings while using black fill by default
- the inspector exposes shadow X offset, Y offset, and opacity controls when a linked shadow exists
- deleting the source text layer also removes its linked shadow layer

### Group Layers

- group layers are currently disabled in the product UI
- new files no longer seed a placeholder group layer
- project-file normalization strips group layers from loaded documents so the feature stays inaccessible to users for now
- the internal layer model still retains group-related helpers so the feature can be resumed later

## Selection

### Single Selection

- click a layer or layer row to select it
- inspector edits operate on the selected layer
- resize handles appear on selection
- once a layer is already selected, dragging from anywhere inside its transformed selection frame starts move immediately, even over transparent pixels
- moving a layer while holding `Shift` now constrains movement to either horizontal or vertical after drag direction is detected
- as long as the document has layers, the editor now keeps at least one layer selected

### Multi-Selection

- selection state supports multiple layer IDs
- `Shift`-click on canvas layers or layer rows toggles layers into and out of the current selection
- current support is mostly shared move and shared resize
- inspector editing is still effectively single-layer oriented
- shared move now also supports the same temporary `Shift` axis lock behavior

### Lasso Selection

- available for erasable surfaces
- starts from the currently selected raster/image layer and no longer clears that selection during pointer down
- captures a polygon drawn over a source layer
- can extract the selected region into a floating selection canvas
- selected pixels can then be moved or deleted
- floating selection dragging supports the same temporary `Shift` axis lock behavior as normal layer movement
- the toolbar exposes a `Sel to Layer` action for committing the active lasso/floating selection into a new layer

The lasso workflow is one of the more advanced features in the app and relies on canvas extraction rather than vector selection metadata.

## Drawing and Erasing

### Pen Tool

- paints on raster, image, or text layers
- smooths strokes from sampled pointer points
- exposes a toolbar brush-size slider with a current default value of `16`
- for text layers, paint is written into a separate overlay canvas
- for raster/image layers, paint is applied directly to the offscreen bitmap
- if the user starts a pen stroke on an SVG image layer, the app first creates a new raster layer above it and paints onto that new layer
- if the document has no layers, starting to draw with the pen creates a new raster layer automatically
- raster pen drawing is no longer limited by the first visible painted bounds or by a stale pre-move box
- after moving a raster layer, later pen strokes map against the layer's current transform rather than its old position
- when a raster stroke grows beyond the current working surface, the preview surface expands without shifting the layer visually during the active gesture

### Eraser Tool

- erases directly from raster/image surfaces
- for text layers, it writes into an erase mask instead of destroying the original text definition
- exposes a toolbar eraser-size slider with a current default value of `28`

### Gradient Tool

- supports linear gradients on raster layers and bitmap image layers
- uses click-and-drag interaction where drag start sets the gradient start and drag end sets the gradient end
- supports two modes in the toolbar:
  - `BG -> FG`
  - `FG -> Transparent`
- applies the final gradient directly onto the clicked target layer rather than creating a separate layer
- commits each gradient application as a single undoable history step
- shows a live overlay preview line while dragging so the user can see direction and spread before release
- the preview line is transient UI only and is not exported or saved into the document
- does not support text layers, shape layers, group layers, or SVG-backed image layers in v1

### Bucket Fill Tool

- fills a contiguous clicked region on raster layers and bitmap image layers
- uses the current global foreground color as the fill color
- includes neighboring pixels only when their RGBA values remain within the current tolerance threshold of the seed pixel
- exposes a toolbar tolerance slider with a current default value of `200`
- commits each fill as a single undoable history step
- stays on the target layer rather than creating a new layer
- does not support text layers, shape layers, group layers, or SVG-backed image layers in v1
- respects alpha lock on raster/image layers by preserving existing pixel alpha and avoiding fills that start in fully transparent regions when alpha lock is enabled

### Alpha Lock

- available on raster, image, and text layers
- constrains drawing to currently visible pixels
- for text, alpha lock uses the visible text shape
- for raster/image, alpha lock masks brush output against the existing bitmap

## Layer Stack Operations

The layer panel currently supports:

- rename
- visibility toggle
- duplicate
- move up/down
- merge down
- delete
- drag-reorder behavior hooks in the main app

Merge down flattens the current layer and the layer below into a new raster layer.

SVG image layers are excluded from merge-down operations in both directions.

## Text Editing

Text layers support:

- direct content editing
- point mode and box mode
- box resizing with reflow
- font selection from a fixed list
- bold toggle
- color editing
- left/center/right alignment in the inspector
- double-click editing even when the text layer is already selected
- inline editing now places the caret at the end of the text when edit mode opens

Important current limitation:

- old paint overlay pixels are not remapped to new glyph outlines after large text/font changes

## Asset Library

The left sidebar functions as a small asset library.

It supports:

- importing local PNG, JPG, SVG, and WEBP files
- storing imported assets in component state
- dragging assets from the sidebar onto the canvas
- creating image layers from dropped assets
- removing imported assets through a small delete button on each asset card
- showing a highlighted canvas drop state while an asset is dragged over the stage

Layout behavior:

- the panel now has a fixed/constrained height inside the sidebar
- the header and import button remain visible while the asset list scrolls
- the thumbnail area uses vertical scrolling only
- adding many assets no longer makes the whole panel keep growing downward
- asset cards use a masonry-like layout so shorter cards do not leave large gaps below them
- each asset card sizes itself according to its name length instead of matching the tallest neighboring card

This asset library is session-local. There is no persistence beyond the current page state.

## Viewport and Navigation

The editor uses a scaled mobile composition inside a fixed-size stage.

Supported behavior includes:

- zoom in/out
- zooming around a point
- coordinate conversion between screen and document space
- right-click or `Alt` with the zoom tool zooms out instead of in
- double-clicking the zoom tool button resets the viewport to `zoom: 1`, `offsetX: 0`, and `offsetY: 0`

The stage visually represents a 1080 x 1440 document inside a 428px-wide display frame.

There is also a prompt-style input rendered below the canvas, but it is currently presentational only and is not wired into document generation or editing behavior.

## Export

The editor can export the current document as a flattened final image.

Supported export types:

- PNG
- JPEG

Export behavior:

- renders at the real `1080 x 1440` document size, not the scaled preview size
- includes visible artwork layers only
- respects layer order, visibility, opacity, position, scale, and rotation
- excludes editor UI such as panels, selection frames, lasso overlays, and snap guides
- uses a transparent background for PNG when the artwork allows it
- uses a white background when exporting JPEG

## Project Files

The editor now supports simple file-based project workflows.

Supported actions:

- New File
- Save File
- Open File
- Export PNG
- Export JPEG

Project file behavior:

- project files are saved as JSON-based `.kryop` files
- saved files include app metadata, a format version, and the serialized document only
- undo/redo history is not saved in v1
- opening a file replaces the current document and resets transient editor runtime state
- the File menu closes on outside click or `Escape`

## Snapping

Move snapping currently supports:

- vertical center
- horizontal center
- left edge
- right edge
- top edge
- bottom edge

Guides are rendered on an overlay canvas while dragging.

When movement is axis-locked with `Shift`, snapping remains active only on the unconstrained axis.

## Resize Behavior

- single-layer resize now uses a stable pointer-down snapshot for the full drag instead of re-basing limits from intermediate transient sizes
- reversing direction during the same resize drag can grow the layer back up naturally instead of getting capped by the smallest transient state reached earlier in the drag
- resize still preserves the existing minimum-size behavior, anchor-handle behavior, and temporary `Shift` proportional resize behavior
- the editor now caps resize results at an absolute maximum of `5000 x 5000`

## Keyboard Shortcuts

The app currently supports:

- `Ctrl/Cmd + Z`: undo
- `Ctrl/Cmd + Shift + Z`: redo
- `Ctrl + Y`: redo
- `Ctrl/Cmd + C`: copy selected layer
- `Ctrl/Cmd + V`: paste copied layer with a `24px` offset on both axes
- `Delete` or `Backspace`: delete selected layer or active floating/lasso selection
- `X`: swap foreground/background colors
- `D`: reset global colors
- `Enter`: clear current layer selection
- while editing text, `Ctrl/Cmd + Enter` commits the text edit
- while editing text, `Escape` cancels the inline text editor

## Persistence

Persistent behavior is still limited, but the editor is no longer session-only.

Currently persisted or saveable:

- foreground/background color pair in `localStorage`
- the full document through `.kryop` project files

Currently not persisted between sessions unless saved as a project file:

- undo/redo history
- asset library
- viewport
- tool settings beyond current session
