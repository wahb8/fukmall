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
- dragging a supported image file in from the desktop now reuses this same centered direct-import placement behavior
- asset-library drop places the image around the drop point
- if an imported image would land partly outside the document, its position is clamped back into bounds
- this keeps large imports, including full-canvas `1080 x 1440` images, from appearing incorrectly offset

### Raster Layers

- used as freehand drawing layers
- can be auto-created when the pen tool needs a drawable target
- persisted as PNG data URLs
- support alpha lock
- raster pen editing uses a stable drawable surface that matches the layer's current `width` and `height`
- pen drawing no longer auto-expands the bitmap surface when the brush reaches the edge
- pen commits no longer grow or shrink layer geometry from painted-content bounds alone

### Text Layers

- text remains editable as structured text, not flattened by default
- support point text and box text modes
- new text layers default to box mode
- support font family, size, weight, color, wrapping, letter spacing, line height, and text alignment
- text layers now also store normalized partial-style ranges through `styleRanges`
- when text is actively being edited and a non-empty text selection exists, supported style changes apply only to that selected range
- when no text range is selected, text styling still uses the existing whole-layer behavior
- mixed-style text now renders visually per styled run instead of collapsing back to one uniform style
- support `left`, `center`, and `right` alignment as a real text-layer property
- for box text, alignment positions each wrapped line inside the text box
- for point text, alignment changes the horizontal anchor behavior:
  left extends rightward from the anchor, center stays centered on the anchor, and right extends leftward from the anchor
- erasing is stored as a mask bitmap
- painting is stored in a separate overlay bitmap so text content can still be edited later
- export uses the same run-based text rendering path, so mixed styles now match between the editor canvas and flattened export

### Text Shadows

- text layers can create a linked shadow layer from the inspector
- the shadow copies the source text content and typography settings while using black fill by default
- the inspector exposes shadow X offset, Y offset, and opacity controls when a linked shadow exists
- deleting the source text layer also removes its linked shadow layer

### Linked Layers

- any two selected layers can be linked from the inspector
- linked pairs move together during single-layer move interactions
- linked pairs also resize together during single-layer resize interactions
- resize linkage is ratio-based: the partner scales around its own center using the same width/height or scale ratio as the actively resized layer
- the inspector exposes both pair-level `Link Layers` / `Unlink` actions for two selected layers and a single-layer `Linked To` readout with `Unlink`
- linked layers show a `linked` chip in the layer list
- deleting one linked layer keeps the other layer but clears the surviving link
- text-shadow pairs are a special case built on top of the same linking mechanism

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
- clicking outside the canvas/stage explicitly clears selection, even though normal in-canvas selection behavior still prefers keeping a valid selection during editing
- canvas picking for raster, image, and text layers is now pixel-aware instead of purely box-based
- transparent pixels in those layer types can fall through to lower visible layers
- pixel-aware selection also uses a small hit padding radius, so clicks slightly near visible text, image edges, or raster strokes can still select the top visible layer

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

### Rectangular Marquee Selection

- available as a separate `rectSelect` tool
- lets the user click-drag a temporary rectangular pixel selection on raster/image/text-editable bitmap surfaces
- does not create a new layer by itself; it remains transient editor state like the lasso selection
- renders a dashed teal rectangle overlay with a translucent fill during and after creation
- can be converted into a floating selection and then committed through the same `Sel to Layer` workflow used by lasso extraction
- constrains pen, eraser, bucket fill, and gradient edits to the marquee rectangle while it is active on the source layer
- bucket fill and gradient treat the marquee as both a clip region and a minimum editable working area, so they still operate across the full marquee even after small pen edits inside it

## Drawing and Erasing

### Pen Tool

- paints on raster, image, or text layers
- smooths strokes from sampled pointer points
- exposes a toolbar brush-size slider with a current default value of `16`
- for text layers, paint is written into a separate overlay canvas
- for raster/image layers, paint is applied directly to the offscreen bitmap
- if the user starts a pen stroke on an SVG image layer, the app first creates a new raster layer above it and paints onto that new layer
- if the document has no layers, starting to draw with the pen creates a new raster layer automatically
- after moving a raster layer, later pen strokes map against the layer's current transform rather than its old position
- raster/image drawing uses the current fixed layer surface and clips naturally at the layer bounds instead of dynamically expanding during the stroke
- when a rectangular marquee is active on the source layer, pen output is clipped to that marquee without rebasing the stroke origin

### Eraser Tool

- erases directly from raster/image surfaces
- for text layers, it writes into an erase mask instead of destroying the original text definition
- exposes a toolbar eraser-size slider with a current default value of `28`
- when a rectangular marquee is active on the source layer, erase output is clipped to that marquee

### Gradient Tool

- supports linear gradients on raster layers and bitmap image layers
- uses click-and-drag interaction where drag start sets the gradient start and drag end sets the gradient end
- supports two modes in the toolbar:
  - `BG -> FG`
  - `FG -> Transparent`
- applies the final gradient directly onto the clicked target layer rather than creating a separate layer
- for non-alpha-locked raster and bitmap image layers, the editable bitmap can expand when the dragged gradient line extends beyond the current bitmap bounds
- when that expansion happens, old pixels stay visually anchored and the committed layer geometry grows to match the expanded bitmap
- when a rectangular marquee is active on the source layer, the gradient is constrained to the marquee and uses that marquee as a minimum working area for the operation
- commits each gradient application as a single undoable history step
- shows a live overlay preview line while dragging so the user can see direction and spread before release
- the preview line is transient UI only and is not exported or saved into the document
- does not support text layers, shape layers, group layers, or SVG-backed image layers in v1
- alpha-locked layers keep the existing visible-alpha restriction and do not use expansion to paint into newly added transparent area

### Bucket Fill Tool

- fills a contiguous clicked region on raster layers and bitmap image layers
- uses the current global foreground color as the fill color
- includes neighboring pixels only when their RGBA values remain within the current tolerance threshold of the seed pixel
- exposes a toolbar tolerance slider with a current default value of `200`
- commits each fill as a single undoable history step
- stays on the target layer rather than creating a new layer
- for non-alpha-locked raster and bitmap image layers, fills that reach the current bitmap edge can expand the editable bitmap instead of treating the old bitmap boundary as a hard wall
- bucket-fill expansion is finite and currently bounded by the document extents rather than becoming unbounded infinite fill
- when a rectangular marquee is active on the source layer, the fill is constrained to that marquee and uses the marquee as a minimum working area for the operation
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
- selected-range styling for supported text style controls while inline editing is active
- left/center/right alignment in the inspector
- double-click editing even when the text layer is already selected
- inline editing now places the caret at the end of the text when edit mode opens
- mixed font/color styling now affects wrapping, alignment, and bounds through the shared text-layout path
- inline edit mode now keeps the styled canvas preview visible underneath the text input layer so partial styling remains visible immediately while editing

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

## External File Drop

The editor also supports dragging supported image files in from the user's machine.

Current behavior:

- dragging a PNG, JPG, JPEG, WEBP, or SVG file over the app shows a stage-centered import overlay
- dropping a supported image file imports it through the same direct image import flow used by the normal file picker
- the browser's default file-open navigation is prevented for supported image drops
- internal asset-library drag/drop remains separate and continues to use the existing asset MIME path
- unsupported file types are ignored and do not show the image import overlay

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
- `New File` opens a modal where the user can set document name, width, and height
- choosing `New File` while there are unsaved changes opens a confirmation modal before the new-file modal
- the app registers a browser `beforeunload` prompt while unsaved changes exist
- save/export filenames are derived from the current document name after filename sanitization
- opening a file replaces the current document and resets transient editor runtime state
- opening or loading a file also clears session-local runtime state such as the asset library, viewport, active tool, and raster caches
- project-file normalization strips disabled group layers and repairs invalid selection and linked-layer references
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
- `Enter`: attempts to clear selection, but current selection-normalization behavior keeps a valid layer selected when layers exist
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
