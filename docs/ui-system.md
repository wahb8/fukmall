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

The implementation now supports two chrome themes:

- a warm editorial light mode
- a darker studio-like mode that keeps the same accent and selection language

## Core Colors

Primary custom properties are defined in `src/App.css`.

### Base Surface Colors

- `--bg`: `#f5efe5`
- `--panel`: `rgba(255, 251, 245, 0.92)`
- `--panel-strong`: `#fffaf2`

Additional light-mode surface variables in `src/App.css` include:

- `--surface`
- `--surface-soft`
- `--surface-strong`
- `--surface-hover`
- `--surface-active`

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

## Dark Theme

The app shell can switch to dark mode through a top-level toggle rendered beside the `File` button.

Implementation notes:

- the shell applies `data-theme="dark"` on `.app-shell`
- `src/App.css` overrides shared custom properties instead of restyling each component separately
- the dark palette keeps the amber accent while shifting panels and canvas chrome to deep blue-gray surfaces
- the document itself is unchanged; this is UI chrome state only

### Canvas Grid Color

- `--canvas-grid`: `rgba(31, 41, 55, 0.08)`

## Typography

### Global Defaults

`src/index.css` sets the root font family to `Arial, sans-serif`.

### Custom Font

The app locally registers bundled font families from `src/index.css`, including:

- `AbrilFatface`
- `Alyamama`
- `AlfaSlabOne`
- `Amiri`
- `AtkinsonHyperlegibleMono`
- `BadeenDisplay`
- `Cairo`
- `Caprasimo`
- `Changa`
- `ElMessiri`
- `Fixture`
- `Gelasio`
- `Lalezar`
- `MerriweatherSans`
- `MPLUS1Code`
- `Oi`
- `Ramaraja`
- `ReemKufi`
- `REM`
- `Rubik`
- `Ubuntu`
- `Ultra`
- `Zain`

### Text Layer Fonts

Available text layer font options currently include:

- AbrilFatface
- Alyamama
- AlfaSlabOne
- Amiri
- Arial
- AtkinsonHyperlegibleMono
- BadeenDisplay
- Cairo
- Caprasimo
- Changa
- ElMessiri
- Fixture
- Gelasio
- Inter
- Lalezar
- MerriweatherSans
- MPLUS1Code
- Oi
- Ramaraja
- ReemKufi
- REM
- Roboto
- Rubik
- Ubuntu
- Ultra
- Zain
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

### Layer Panel

The layer panel now follows the same split-panel idea as the asset library:

- a scrollable layer-row region
- a fixed footer region for the add-drawing action

The visible row region is intentionally capped to about six normal layer rows, so the right sidebar does not keep growing taller as layers are added.

Only the layer rows scroll. The footer action stays visible and stationary.

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
- a nearby theme toggle labeled `Dark UI` / `Light UI`
- contextual range/select controls for brush size, eraser size, bucket tolerance, and gradient mode
- a compact history control cluster for undo/redo
- swap/reset buttons for the global foreground/background color pair
- a transient inline error/status pill when a tool action is unavailable

The file workflow also uses centered modal cards for:

- unsaved-changes confirmation before creating a new file
- new-file creation with document name, width, and height fields

## Motion and Animation

There are no large bespoke animations or timeline-driven transitions.

Current motion is mostly interaction feedback:

- button hover transitions on transform, border, and background
- drag feedback through opacity and guide rendering
- canvas/tool feedback through cursor changes and overlay drawing

Transition timing in controls is short and subtle:

- `160ms ease` on key control states

This means the app feels responsive, but it is not currently a motion-heavy interface.

Theme switching also benefits from the existing variable-driven transitions on controls and surfaces,
but it is still a straightforward palette swap rather than a dedicated animated mode change.

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
- selection chrome is rendered as editor UI, not artwork, so lowering a layer's opacity should not fade the visible bounds or handle styling

Passive selections use dashed outlines.

Layer rows can also show compact chips for:

- `alpha lock`
- `linked`

The layer panel footer includes a single icon action for creating a new drawing layer.

Inline text editing swaps the rendered text canvas for a textarea with a dashed teal border.

There is currently no active group-layer-specific UI because the group feature is disabled.

Below the canvas there is a styled prompt shell with a single input, but it is currently visual-only and not connected to editing logic.

During supported external desktop image-file drags, the stage also shows a centered import overlay card.

## Responsive Notes

Responsive handling exists, but the editor is still fundamentally optimized around the fixed artboard experience rather than a fully fluid canvas product.

Key breakpoints:

- `1120px`
- `720px`

Below these sizes, layout stacks and density reduces, but the core canvas metaphor stays the same.
