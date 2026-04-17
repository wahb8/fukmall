# SVG Support

## Summary

The app supports simple SVG-backed image layers.

This is not a full vector editing system. SVGs are treated as a sharper kind of image layer:

- they import through the normal image flows
- they stay crisp during normal display and resizing
- they can still participate in normal layer transforms and selection
- pen drawing creates a separate raster drawing layer above the SVG
- some other bitmap-only workflows can still use temporary raster surfaces when they need canvas data

## Current Scope

Supported:

- main SVG import flow
- asset library SVG import
- dragging SVG assets from the asset library onto the canvas
- move
- resize
- duplicate
- reorder
- selection
- snapping
- undo/redo
- pen drawing onto a newly created raster layer above the SVG

Not supported:

- path editing
- anchor editing
- stroke/fill editing of internal SVG geometry
- boolean operations
- a dedicated vector toolset

## Layer Model

SVGs still use the existing `image` layer type.

The distinction is stored through image source metadata:

- `sourceKind: 'svg'`

That allows the app to keep the current document model and interaction system without introducing a brand new vector layer type.

## Import Behavior

When an SVG is imported:

1. the file is accepted through the existing image import path
2. the source is read and stored on the layer as `src`
3. the layer is tagged with `sourceKind: 'svg'`
4. intrinsic dimensions are resolved from the SVG when possible
5. the layer is created with `scaleX: 1` and `scaleY: 1`
6. raster-only transparent-edge trimming is skipped, so the SVG remains vector-backed for normal display

Dimension detection currently tries:

- explicit `width` and `height`
- `viewBox`
- `width + viewBox`
- `height + viewBox`

This helps support more SVG files without shrinking them into arbitrary fallback sizes by default.

## Normal Rendering

For standard viewing and transforms, SVG-backed image layers render through the browser's normal image/SVG path.

That means:

- the original SVG source is preserved
- resizing stays sharp
- the layer is not prematurely flattened into a bitmap just for normal display

This is the main reason SVG layers can remain visually crisp.

The editor also avoids switching SVG layers into the temporary raster path just because a bitmap tool is selected. A bitmap tool only swaps an SVG layer into the canvas editing path when that specific layer is actively being edited.

## Bitmap-Only Workflows

Several editor tools are fundamentally bitmap-based:

- pen/paint
- eraser
- lasso pixel selection
- destructive pixel-region edits
- some merge/flatten flows

The current SVG behavior is split:

### Pen

When the user starts drawing on an SVG-backed image layer with the pen tool, the app creates a new raster drawing layer above the SVG and draws into that new layer.

That means:

- the original SVG layer stays SVG-backed
- the new paint lives in a normal raster layer
- normal SVG rendering quality is preserved

### Other Bitmap Workflows

Some other bitmap-oriented workflows may still rasterize an SVG-backed layer into a temporary canvas workflow when they need direct pixel access.

Those workflows do not imply that pen should draw directly into the SVG layer anymore.

### Merge Behavior

SVG-backed image layers are excluded from merge/flatten combinations with other layers.

That means:

- an SVG layer cannot merge down into another layer
- another layer cannot merge down into an SVG layer

This keeps the feature simple and compatible with the current architecture.

## Rasterization Quality

When the editor needs a temporary raster surface for an SVG-backed layer, it now tries to size that surface from the layer's current displayed geometry rather than only the original import size.

Important implications:

- scaled SVGs should not keep reusing an old low-resolution raster surface
- cache invalidation depends on the current effective raster surface dimensions
- temporary raster surfaces are oversampled from the current displayed box rather than blindly tied to the original intrinsic source size

This is especially important for workflows such as:

- eraser
- lasso
- temporary bitmap editing workflows

## Architectural Tradeoff

The SVG implementation is intentionally hybrid:

- vector-backed for normal viewing
- vector-backed while pen drawing creates separate raster layers above it
- raster-backed temporarily only for SVG workflows that truly need pixel access

This is a practical compromise for the current codebase because the editor was originally built around canvas-based image operations rather than a full vector object model.

## Future Directions

Reasonable next steps if SVG support expands:

- improve SVG intrinsic sizing and fallback handling further
- preserve SVG-backed layers longer across more workflows
- add optional rasterize commands for explicit bitmap conversion workflows
- introduce a dedicated vector layer type only if true vector editing becomes a goal

Unreasonable next step for this codebase without larger refactoring:

- full Illustrator/Figma-style vector editing on top of the current interaction architecture
