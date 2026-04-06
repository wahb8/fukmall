# Fukmall

Fukmall is a client-side React + Vite layered composition editor prototype. It behaves like a compact design tool for a mobile-sized document, with layered artwork editing, text editing, raster painting, erasing, bucket fill, gradients, lasso selection, snapping, asset import, project-file save/open, and flattened PNG/JPEG export.

## Getting Started

```bash
npm install
npm run dev
```

Other useful scripts:

- `npm run build`
- `npm run lint`
- `npm run preview`

## Project Shape

- `src/App.jsx` is the main app shell and currently owns most editor behavior.
- `src/lib/` contains the main helper seams for document state, bitmap operations, text layout, export, and file serialization.
- `docs/` is the primary documentation set for architecture, features, state/history behavior, and editing constraints.

## Documentation

Start with:

1. [`docs/architecture.md`](./docs/architecture.md)
2. [`docs/state-and-history.md`](./docs/state-and-history.md)
3. [`docs/features.md`](./docs/features.md)
4. [`docs/file-map.md`](./docs/file-map.md)

## Current Product Constraints

- Group layers are intentionally disabled in the user-facing app, even though some internal helper code remains.
- Undo/redo is snapshot-based and stored in memory only.
- Project files save the current document, but not undo/redo history or session-local runtime state.
