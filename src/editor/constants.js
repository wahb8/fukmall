export const HANDLE_DIRECTIONS = [
  { key: 'nw', x: -1, y: -1 },
  { key: 'n', x: 0, y: -1 },
  { key: 'ne', x: 1, y: -1 },
  { key: 'e', x: 1, y: 0 },
  { key: 'se', x: 1, y: 1 },
  { key: 's', x: 0, y: 1 },
  { key: 'sw', x: -1, y: 1 },
  { key: 'w', x: -1, y: 0 },
]

export const MIN_LAYER_WIDTH = 72
export const MIN_LAYER_HEIGHT = 48
export const MAX_LAYER_SIZE = 5000
export const DEFAULT_ERASER_SIZE = 28
export const DEFAULT_PEN_SIZE = 16
export const DEFAULT_BUCKET_TOLERANCE = 200
export const MIN_DOCUMENT_DIMENSION = 1
export const DISPLAY_DOCUMENT_WIDTH = 428
export const TOOL_PANEL_ERROR_DURATION_MS = 4000
export const TOOL_PANEL_ERROR_FADE_DELAY_MS = 3200
export const MIN_VIEWPORT_ZOOM = 0.1
export const MAX_VIEWPORT_ZOOM = 8
export const VIEWPORT_ZOOM_STEP = 1.25
export const RESIZE_HANDLE_VISIBLE_SIZE_PX = 13
export const RESIZE_HANDLE_HIT_PADDING_PX = 16
export const ASSET_DRAG_MIME_TYPE = 'application/x-fukmall-asset-id'
export const NO_LAYERS_TOOL_ERROR_MESSAGE = 'There are no layers to edit. Add a layer first.'
export const DEFAULT_TEXT_SHADOW_OFFSET_X = 8
export const DEFAULT_TEXT_SHADOW_OFFSET_Y = 8
export const DEFAULT_TEXT_SHADOW_OPACITY = 0.4

export const TOOLS = {
  SELECT: 'select',
  PEN: 'pen',
  ERASER: 'eraser',
  ZOOM: 'zoom',
  BUCKET: 'bucket',
  GRADIENT: 'gradient',
  LASSO: 'lasso',
  RECT_SELECT: 'rectSelect',
}
