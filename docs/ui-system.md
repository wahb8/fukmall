# UI Details

## Visual Direction

The app uses a warm editorial workspace look rather than a neutral SaaS panel style.

The design language is built around:

- warm cream backgrounds
- amber accent color
- teal selection/snap color
- rounded panels and controls
- soft shadows and glassy translucent surfaces

The UI is meant to feel like a design tool, but softer and more tactile than a default gray desktop editor.

## Core Colors

Primary custom properties are defined in `src/App.css`.

### Base Surface Colors

- `--bg`: `#f5efe5`
- `--panel`: `rgba(255, 251, 245, 0.92)`
- `--panel-strong`: `#fffaf2`

### Line and Border Colors

- `--line`: `rgba(120, 92, 55, 0.18)`
- `--line-strong`: `rgba(120, 92, 55, 0.32)`

### Text Colors

- `--ink`: `#1f2937`
- `--muted`: `#6b7280`

### Accent and Interaction Colors

- `--accent`: `#d97706`
- `--accent-strong`: `#b45309`
- `--selection`: `#0f766e`

### Canvas Grid Color

- `--canvas-grid`: `rgba(31, 41, 55, 0.08)`

## Typography

### Global Defaults

`src/index.css` sets the root font family to `Arial, sans-serif`.

### Custom Font

The app locally registers bundled font families from `src/index.css`, including:

- `AbrilFatface`
- `AlfaSlabOne`
- `AtkinsonHyperlegibleMono`
- `Caprasimo`
- `Fixture`
- `Gelasio`
- `MerriweatherSans`
- `MPLUS1Code`
- `Oi`
- `Ramaraja`
- `REM`
- `Ubuntu`
- `Ultra`

### Text Layer Fonts

Available text layer font options currently include:

- AbrilFatface
- AlfaSlabOne
- Arial
- AtkinsonHyperlegibleMono
- Caprasimo
- Fixture
- Gelasio
- Inter
- MerriweatherSans
- MPLUS1Code
- Oi
- Ramaraja
- REM
- Roboto
- Ubuntu
- Ultra
- Georgia
- Times New Roman
- Courier New

These options are defined in `src/lib/fontOptions.js`.

## Layout

The app uses a three-column workspace at large widths:

- left: asset sidebar
- center: canvas workspace
- right: layer stack and inspector

The main layout container is `.workspace-grid`.

At smaller breakpoints:

- the layout collapses to one column
- sidebars stack vertically
- asset grid column counts are reduced

### Asset Library Panel

The asset library panel now uses a split layout:

- a fixed header region for the title and import button
- a scrollable body region for the asset thumbnails

The panel height is intentionally capped so the sidebar does not keep growing with the asset count.

Asset cards now use a masonry-like layout:

- cards can have different heights based on asset name length
- the list packs vertically without leaving large row gaps
- each card includes a small delete button anchored to the lower-right area of the card chrome rather than over the thumbnail

While an asset is being dragged over the stage, the canvas receives an accent-colored active-drop outline.

## Stage and Canvas

The visible stage is styled as a phone-like artboard container:

- stage width: `428px`
- stage height: `570px`
- underlying document size: `1080 x 1440`
- document aspect ratio: `3:4`
- viewport uses `transform-origin: top left`

The background combines:

- subtle graph-paper grid lines
- white-to-cream gradients
- soft rounded corners

## Controls

Buttons and controls are visually consistent:

- pill-shaped buttons
- rounded inputs
- translucent light backgrounds
- hover lift through a small `translateY(-1px)`

Selection and active states primarily use teal.

Danger states use dark red text rather than aggressive red fills.

The top toolbar also includes:

- a `File` dropdown anchored near the top-left of the app shell
- contextual range/select controls for brush size, eraser size, bucket tolerance, and gradient mode
- a compact history control cluster for undo/redo

## Motion and Animation

There are no large bespoke animations or timeline-driven transitions.

Current motion is mostly interaction feedback:

- button hover transitions on transform, border, and background
- drag feedback through opacity and guide rendering
- canvas/tool feedback through cursor changes and overlay drawing

Transition timing in controls is short and subtle:

- `160ms ease` on key control states

This means the app feels responsive, but it is not currently a motion-heavy interface.

## Cursor System

The app forces a custom pointer cursor globally from `src/assets/pointer.svg`.

Tool-specific behavior then overrides perceived interaction through:

- `grab` / `grabbing` on movable layers
- `crosshair`-style behavior for eraser/lasso modes
- directional resize cursors on handles

## Layer Visuals

Selected layers use:

- teal borders
- shared selection frames
- resize handles with white fill and teal outline

Passive selections use dashed outlines.

Inline text editing swaps the rendered text canvas for a textarea with a dashed teal border.

There is currently no active group-layer-specific UI because the group feature is disabled.

Below the canvas there is a styled prompt shell with a single input, but it is currently visual-only and not connected to editing logic.

## Responsive Notes

Responsive handling exists, but the editor is still fundamentally optimized around the fixed artboard experience rather than a fully fluid canvas product.

Key breakpoints:

- `1120px`
- `720px`

Below these sizes, layout stacks and density reduces, but the core canvas metaphor stays the same.
