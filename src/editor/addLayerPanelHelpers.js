import { createImageLayer, createTextLayer } from '../lib/layers'
import { getDefaultImportedImagePosition } from './documentHelpers'
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  MIN_LAYER_HEIGHT,
  MIN_LAYER_WIDTH,
} from './constants'
import { resizeBoxText, resizePointTextTransform } from '../lib/textLayer'

const VALID_TEXT_ALIGNMENTS = new Set(['left', 'center', 'right'])
const DEFAULT_TEXT_LAYER = createTextLayer()
const DEFAULT_IMAGE_LAYER = createImageLayer()
function coerceNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const numericValue = Number(trimmedValue)
  return Number.isFinite(numericValue) ? numericValue : null
}

function coerceInteger(value) {
  const numericValue = coerceNumber(value)
  return numericValue === null ? null : Math.trunc(numericValue)
}

function clampTextSpecSize(value) {
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, value))
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toLowerCase()

  if (normalizedValue === 'true') {
    return true
  }

  if (normalizedValue === 'false') {
    return false
  }

  return null
}

function coerceString(value) {
  return typeof value === 'string' ? value : null
}

function coerceOptionalString(value) {
  const stringValue = coerceString(value)
  return stringValue === null ? null : stringValue.trim()
}

function coerceNonEmptyStringExact(value) {
  if (typeof value !== 'string') {
    return null
  }

  return value.length > 0 ? value : null
}

function coerceLayerName(value) {
  const stringValue = coerceOptionalString(value)
  return stringValue ? stringValue : null
}

function coerceTextAlignment(value) {
  const stringValue = coerceOptionalString(value)

  if (!stringValue) {
    return null
  }

  return VALID_TEXT_ALIGNMENTS.has(stringValue) ? stringValue : null
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

export function getDefaultTextLayerFormValues() {
  return {
    text: DEFAULT_TEXT_LAYER.text,
    color: DEFAULT_TEXT_LAYER.color,
    bolded: DEFAULT_TEXT_LAYER.fontWeight >= 700,
    font: DEFAULT_TEXT_LAYER.fontFamily,
    size: String(DEFAULT_TEXT_LAYER.fontSize),
    alignment: DEFAULT_TEXT_LAYER.textAlign,
    x: String(DEFAULT_TEXT_LAYER.x),
    y: String(DEFAULT_TEXT_LAYER.y),
    width: String(DEFAULT_TEXT_LAYER.width),
    height: String(DEFAULT_TEXT_LAYER.height),
    addShadow: false,
    layerPlacement: '',
  }
}

export function getDefaultImageLayerFormValues() {
  return {
    src: DEFAULT_IMAGE_LAYER.src,
    x: String(DEFAULT_IMAGE_LAYER.x),
    y: String(DEFAULT_IMAGE_LAYER.y),
    width: String(DEFAULT_IMAGE_LAYER.width),
    height: String(DEFAULT_IMAGE_LAYER.height),
    opacity: String(DEFAULT_IMAGE_LAYER.opacity),
    rotation: String(DEFAULT_IMAGE_LAYER.rotation),
    scaleX: String(DEFAULT_IMAGE_LAYER.scaleX),
    scaleY: String(DEFAULT_IMAGE_LAYER.scaleY),
    layerPlacement: '',
  }
}

export function resolveStoredLayerPosition(input, fallbackPosition = { x: 0, y: 0 }) {
  const hasExplicitX = input?.x !== undefined && input?.x !== null
  const hasExplicitY = input?.y !== undefined && input?.y !== null
  const x = hasExplicitX ? coerceNumber(input.x) : null
  const y = hasExplicitY ? coerceNumber(input.y) : null

  return {
    x: x ?? fallbackPosition.x,
    y: y ?? fallbackPosition.y,
    hasExplicitX: hasExplicitX && x !== null,
    hasExplicitY: hasExplicitY && y !== null,
  }
}

export function resolveStoredLayerSize(
  input,
  fallbackSize = { width: 0, height: 0 },
  minimumSize = { width: MIN_LAYER_WIDTH, height: MIN_LAYER_HEIGHT },
) {
  const hasExplicitWidth = input?.width !== undefined && input?.width !== null
  const hasExplicitHeight = input?.height !== undefined && input?.height !== null
  const width = hasExplicitWidth ? coerceNumber(input.width) : null
  const height = hasExplicitHeight ? coerceNumber(input.height) : null

  return {
    width: width !== null && width > 0
      ? Math.max(minimumSize.width, width)
      : fallbackSize.width,
    height: height !== null && height > 0
      ? Math.max(minimumSize.height, height)
      : fallbackSize.height,
    hasExplicitWidth: hasExplicitWidth && width !== null && width > 0,
    hasExplicitHeight: hasExplicitHeight && height !== null && height > 0,
  }
}

export function applyInspectorSizeToLayer(layer, sizeInput, minimumSize = {}) {
  const nextMinimumSize = {
    width: minimumSize.width ?? MIN_LAYER_WIDTH,
    height: minimumSize.height ?? MIN_LAYER_HEIGHT,
  }
  const resolvedSize = resolveStoredLayerSize(
    sizeInput,
    {
      width: layer?.width ?? MIN_LAYER_WIDTH,
      height: layer?.height ?? MIN_LAYER_HEIGHT,
    },
    nextMinimumSize,
  )

  if (
    layer?.type === 'text' &&
    layer.mode === 'box' &&
    resolvedSize.hasExplicitWidth &&
    resolvedSize.hasExplicitHeight
  ) {
    return resizeBoxText(
      layer,
      Math.max(nextMinimumSize.width, resolvedSize.width),
      Math.max(nextMinimumSize.height, resolvedSize.height),
    )
  }

  let nextLayer = layer

  if (resolvedSize.hasExplicitWidth) {
    const nextWidth = Math.max(nextMinimumSize.width, resolvedSize.width)

    if (layer?.type === 'text') {
      nextLayer = layer.mode === 'box'
        ? resizeBoxText(nextLayer, nextWidth)
        : resizePointTextTransform(
          nextLayer,
          Math.max(0.1, nextWidth / Math.max(nextLayer.measuredWidth ?? nextLayer.width, 1)),
          nextLayer.scaleY,
        )
    } else {
      nextLayer = {
        ...nextLayer,
        width: nextWidth,
      }
    }
  }

  if (resolvedSize.hasExplicitHeight) {
    const nextHeight = Math.max(nextMinimumSize.height, resolvedSize.height)

    if (layer?.type === 'text') {
      nextLayer = nextLayer.mode === 'box'
        ? resizeBoxText(nextLayer, nextLayer.boxWidth ?? nextLayer.width, nextHeight)
        : resizePointTextTransform(
          nextLayer,
          nextLayer.scaleX,
          Math.max(0.1, nextHeight / Math.max(nextLayer.measuredHeight ?? nextLayer.height, 1)),
        )
    } else {
      nextLayer = {
        ...nextLayer,
        height: nextHeight,
      }
    }
  }

  return nextLayer
}

export function createTextLayerFromAddSpec(spec) {
  const normalizedSpec = spec ?? {}
  const baseLayer = createTextLayer({
    ...(normalizedSpec.name ? { name: normalizedSpec.name } : {}),
    ...(Object.prototype.hasOwnProperty.call(normalizedSpec, 'text')
      ? { text: normalizedSpec.text }
      : {}),
    ...(normalizedSpec.color ? { color: normalizedSpec.color } : {}),
    ...(normalizedSpec.font ? { fontFamily: normalizedSpec.font } : {}),
    ...(normalizedSpec.size !== undefined ? { fontSize: normalizedSpec.size } : {}),
    ...(normalizedSpec.alignment ? { textAlign: normalizedSpec.alignment } : {}),
    ...(normalizedSpec.bolded !== undefined
      ? { fontWeight: normalizedSpec.bolded ? 700 : 400 }
      : {}),
    ...resolveStoredLayerPosition(normalizedSpec, {
      x: DEFAULT_TEXT_LAYER.x,
      y: DEFAULT_TEXT_LAYER.y,
    }),
  })

  return applyInspectorSizeToLayer(baseLayer, normalizedSpec, {
    width: MIN_LAYER_WIDTH,
    height: MIN_LAYER_HEIGHT,
  })
}

export function createExactTextLayerFromJsonSpec(spec) {
  const normalizedSpec = spec ?? {}
  const requestedPosition = resolveStoredLayerPosition(normalizedSpec, {
    x: DEFAULT_TEXT_LAYER.x,
    y: DEFAULT_TEXT_LAYER.y,
  })
  const requestedSize = resolveStoredLayerSize(
    normalizedSpec,
    {
      width: DEFAULT_TEXT_LAYER.width,
      height: DEFAULT_TEXT_LAYER.height,
    },
    {
      width: MIN_LAYER_WIDTH,
      height: MIN_LAYER_HEIGHT,
    },
  )
  const seedLayer = createTextLayer({
    ...(normalizedSpec.name ? { name: normalizedSpec.name } : {}),
    ...(Object.prototype.hasOwnProperty.call(normalizedSpec, 'text')
      ? { text: normalizedSpec.text }
      : {}),
    ...(normalizedSpec.color ? { color: normalizedSpec.color } : {}),
    ...(normalizedSpec.font ? { fontFamily: normalizedSpec.font } : {}),
    ...(normalizedSpec.size !== undefined ? { fontSize: normalizedSpec.size } : {}),
    ...(normalizedSpec.alignment ? { textAlign: normalizedSpec.alignment } : {}),
    ...(normalizedSpec.bolded !== undefined
      ? { fontWeight: normalizedSpec.bolded ? 700 : 400 }
      : {}),
    x: requestedPosition.x,
    y: requestedPosition.y,
  })

  if (!(requestedSize.hasExplicitWidth || requestedSize.hasExplicitHeight)) {
    return seedLayer
  }

  return resizeBoxText(
    {
      ...seedLayer,
      x: requestedPosition.x,
      y: requestedPosition.y,
      preserveExactJsonBoxSize: true,
    },
    requestedSize.width,
    requestedSize.height,
  )
}

export async function createImageLayerFromAddSpec(
  spec,
  {
    loadImageDimensions,
    documentWidth,
    documentHeight,
  },
) {
  const requestedSize = resolveStoredLayerSize(
    spec,
    {
      width: DEFAULT_IMAGE_LAYER.width,
      height: DEFAULT_IMAGE_LAYER.height,
    },
    {
      width: MIN_LAYER_WIDTH,
      height: MIN_LAYER_HEIGHT,
    },
  )
  let width = requestedSize.width
  let height = requestedSize.height

  if (!(requestedSize.hasExplicitWidth && requestedSize.hasExplicitHeight)) {
    const dimensions = await loadImageDimensions(spec.src)
    width = requestedSize.hasExplicitWidth
      ? requestedSize.width
      : Math.max(MIN_LAYER_WIDTH, dimensions.width)
    height = requestedSize.hasExplicitHeight
      ? requestedSize.height
      : Math.max(MIN_LAYER_HEIGHT, dimensions.height)
  }

  const storedPosition = applyExplicitImagePosition(
    resolveStoredLayerPosition(spec, {
      x: DEFAULT_IMAGE_LAYER.x,
      y: DEFAULT_IMAGE_LAYER.y,
    }),
    width,
    height,
    documentWidth,
    documentHeight,
  )

  return createImageLayer({
    ...(spec.name ? { name: spec.name } : {}),
    x: storedPosition.x,
    y: storedPosition.y,
    width,
    height,
    src: spec.src,
    bitmap: spec.src,
    sourceKind: spec.sourceKind ?? 'bitmap',
    opacity: spec.opacity ?? DEFAULT_IMAGE_LAYER.opacity,
    rotation: spec.rotation ?? DEFAULT_IMAGE_LAYER.rotation,
    scaleX: spec.scaleX ?? DEFAULT_IMAGE_LAYER.scaleX,
    scaleY: spec.scaleY ?? DEFAULT_IMAGE_LAYER.scaleY,
    fit: 'fill',
  })
}

export function applyExplicitImagePosition(
  storedPosition,
  width,
  height,
  documentWidth,
  documentHeight,
) {
  const defaultPosition = getDefaultImportedImagePosition(
    width,
    height,
    documentWidth,
    documentHeight,
  )

  if (!storedPosition?.hasExplicitX && !storedPosition?.hasExplicitY) {
    return defaultPosition
  }

  return {
    x: storedPosition?.hasExplicitX ? storedPosition.x : defaultPosition.x + (width / 2),
    y: storedPosition?.hasExplicitY ? storedPosition.y : defaultPosition.y + (height / 2),
  }
}

export function normalizeTextLayerSpec(input) {
  if (!isRecord(input)) {
    return null
  }

  const nextSpec = {}

  if (hasOwn(input, 'Layer name')) {
    const name = coerceLayerName(input['Layer name'])

    if (name) {
      nextSpec.name = name
    }
  }

  if (hasOwn(input, 'text')) {
    const text = coerceString(input.text)

    if (text !== null) {
      nextSpec.text = text
    }
  }

  if (hasOwn(input, 'color')) {
    const color = coerceOptionalString(input.color)

    if (color) {
      nextSpec.color = color
    }
  }

  if (hasOwn(input, 'bolded')) {
    const bolded = coerceBoolean(input.bolded)

    if (bolded !== null) {
      nextSpec.bolded = bolded
    }
  }

  if (hasOwn(input, 'font')) {
    const font = coerceOptionalString(input.font)

    if (font) {
      nextSpec.font = font
    }
  }

  if (hasOwn(input, 'size')) {
    const size = coerceNumber(input.size)

    if (size !== null && size > 0) {
      nextSpec.size = clampTextSpecSize(size)
    }
  }

  if (hasOwn(input, 'alignment')) {
    const alignment = coerceTextAlignment(input.alignment)

    if (alignment) {
      nextSpec.alignment = alignment
    }
  }

  if (hasOwn(input, 'x')) {
    const x = coerceNumber(input.x)

    if (x !== null) {
      nextSpec.x = x
    }
  }

  if (hasOwn(input, 'y')) {
    const y = coerceNumber(input.y)

    if (y !== null) {
      nextSpec.y = y
    }
  }

  if (hasOwn(input, 'width')) {
    const width = coerceNumber(input.width)

    if (width !== null && width > 0) {
      nextSpec.width = width
    }
  }

  if (hasOwn(input, 'height')) {
    const height = coerceNumber(input.height)

    if (height !== null && height > 0) {
      nextSpec.height = height
    }
  }

  if (hasOwn(input, 'addShadow')) {
    const addShadow = coerceBoolean(input.addShadow)

    if (addShadow !== null) {
      nextSpec.addShadow = addShadow
    }
  }

  if (hasOwn(input, 'layerPlacement')) {
    const layerPlacement = coerceInteger(input.layerPlacement)

    if (layerPlacement !== null) {
      nextSpec.layerPlacement = layerPlacement
    }
  }

  return nextSpec
}

export function normalizeJsonTextLayerSpec(input) {
  if (!isRecord(input)) {
    return null
  }

  const nextSpec = {}

  if (hasOwn(input, 'Layer name')) {
    const name = coerceLayerName(input['Layer name'])

    if (name) {
      nextSpec.name = name
    }
  }

  if (hasOwn(input, 'text')) {
    const text = coerceString(input.text)

    if (text !== null) {
      nextSpec.text = text
    }
  }

  if (hasOwn(input, 'color')) {
    const color = coerceNonEmptyStringExact(input.color)

    if (color !== null) {
      nextSpec.color = color
    }
  }

  if (hasOwn(input, 'bolded')) {
    const bolded = coerceBoolean(input.bolded)

    if (bolded !== null) {
      nextSpec.bolded = bolded
    }
  }

  if (hasOwn(input, 'font')) {
    const font = coerceNonEmptyStringExact(input.font)

    if (font !== null) {
      nextSpec.font = font
    }
  }

  if (hasOwn(input, 'size')) {
    const size = coerceNumber(input.size)

    if (size !== null && size > 0) {
      nextSpec.size = clampTextSpecSize(size)
    }
  }

  if (hasOwn(input, 'alignment')) {
    const alignment = coerceString(input.alignment)

    if (alignment !== null && VALID_TEXT_ALIGNMENTS.has(alignment)) {
      nextSpec.alignment = alignment
    }
  }

  if (hasOwn(input, 'x')) {
    const x = coerceNumber(input.x)

    if (x !== null) {
      nextSpec.x = x
    }
  }

  if (hasOwn(input, 'y')) {
    const y = coerceNumber(input.y)

    if (y !== null) {
      nextSpec.y = y
    }
  }

  if (hasOwn(input, 'width')) {
    const width = coerceNumber(input.width)

    if (width !== null && width > 0) {
      nextSpec.width = width
    }
  }

  if (hasOwn(input, 'height')) {
    const height = coerceNumber(input.height)

    if (height !== null && height > 0) {
      nextSpec.height = height
    }
  }

  if (hasOwn(input, 'addShadow')) {
    const addShadow = coerceBoolean(input.addShadow)

    if (addShadow !== null) {
      nextSpec.addShadow = addShadow
    }
  }

  if (hasOwn(input, 'layerPlacement')) {
    const layerPlacement = coerceInteger(input.layerPlacement)

    if (layerPlacement !== null) {
      nextSpec.layerPlacement = layerPlacement
    }
  }

  return nextSpec
}

export function normalizeImageLayerSpec(input) {
  if (!isRecord(input)) {
    return null
  }

  const nextSpec = {}
  const src = hasOwn(input, 'src') ? coerceOptionalString(input.src) : null

  if (!src) {
    return null
  }

  nextSpec.src = src

  if (hasOwn(input, 'Layer name')) {
    const name = coerceLayerName(input['Layer name'])

    if (name) {
      nextSpec.name = name
    }
  }

  if (hasOwn(input, 'x')) {
    const x = coerceNumber(input.x)

    if (x !== null) {
      nextSpec.x = x
    }
  }

  if (hasOwn(input, 'y')) {
    const y = coerceNumber(input.y)

    if (y !== null) {
      nextSpec.y = y
    }
  }

  if (hasOwn(input, 'width')) {
    const width = coerceNumber(input.width)

    if (width !== null && width > 0) {
      nextSpec.width = width
    }
  }

  if (hasOwn(input, 'height')) {
    const height = coerceNumber(input.height)

    if (height !== null && height > 0) {
      nextSpec.height = height
    }
  }

  if (hasOwn(input, 'opacity')) {
    const opacity = coerceNumber(input.opacity)

    if (opacity !== null) {
      nextSpec.opacity = opacity
    }
  }

  if (hasOwn(input, 'rotation')) {
    const rotation = coerceNumber(input.rotation)

    if (rotation !== null) {
      nextSpec.rotation = rotation
    }
  }

  if (hasOwn(input, 'scaleX')) {
    const scaleX = coerceNumber(input.scaleX)

    if (scaleX !== null) {
      nextSpec.scaleX = scaleX
    }
  }

  if (hasOwn(input, 'scaleY')) {
    const scaleY = coerceNumber(input.scaleY)

    if (scaleY !== null) {
      nextSpec.scaleY = scaleY
    }
  }

  if (hasOwn(input, 'layerPlacement')) {
    const layerPlacement = coerceInteger(input.layerPlacement)

    if (layerPlacement !== null) {
      nextSpec.layerPlacement = layerPlacement
    }
  }

  return nextSpec
}

export function buildTextFormValuesFromSpec(spec) {
  const defaultValues = getDefaultTextLayerFormValues()
  const safeSpec = spec ?? {}

  return {
    text: hasOwn(safeSpec, 'text') ? safeSpec.text : defaultValues.text,
    color: safeSpec.color ?? defaultValues.color,
    bolded: safeSpec.bolded ?? defaultValues.bolded,
    font: safeSpec.font ?? defaultValues.font,
    size: safeSpec.size !== undefined ? String(safeSpec.size) : defaultValues.size,
    alignment: safeSpec.alignment ?? defaultValues.alignment,
    x: safeSpec.x !== undefined ? String(safeSpec.x) : defaultValues.x,
    y: safeSpec.y !== undefined ? String(safeSpec.y) : defaultValues.y,
    width: safeSpec.width !== undefined ? String(safeSpec.width) : defaultValues.width,
    height: safeSpec.height !== undefined ? String(safeSpec.height) : defaultValues.height,
    addShadow: safeSpec.addShadow ?? defaultValues.addShadow,
    layerPlacement: safeSpec.layerPlacement !== undefined
      ? String(safeSpec.layerPlacement)
      : defaultValues.layerPlacement,
  }
}

export function buildImageFormValuesFromSpec(spec) {
  const defaultValues = getDefaultImageLayerFormValues()
  const safeSpec = spec ?? {}

  return {
    src: safeSpec.src ?? defaultValues.src,
    x: safeSpec.x !== undefined ? String(safeSpec.x) : defaultValues.x,
    y: safeSpec.y !== undefined ? String(safeSpec.y) : defaultValues.y,
    width: safeSpec.width !== undefined ? String(safeSpec.width) : defaultValues.width,
    height: safeSpec.height !== undefined ? String(safeSpec.height) : defaultValues.height,
    opacity: safeSpec.opacity !== undefined ? String(safeSpec.opacity) : defaultValues.opacity,
    rotation: safeSpec.rotation !== undefined ? String(safeSpec.rotation) : defaultValues.rotation,
    scaleX: safeSpec.scaleX !== undefined ? String(safeSpec.scaleX) : defaultValues.scaleX,
    scaleY: safeSpec.scaleY !== undefined ? String(safeSpec.scaleY) : defaultValues.scaleY,
    layerPlacement: safeSpec.layerPlacement !== undefined
      ? String(safeSpec.layerPlacement)
      : defaultValues.layerPlacement,
  }
}

export function normalizeTextLayerSpecFromForm(formValues) {
  return normalizeTextLayerSpec({
    text: formValues.text,
    color: formValues.color,
    bolded: formValues.bolded,
    font: formValues.font,
    size: formValues.size,
    alignment: formValues.alignment,
    x: formValues.x,
    y: formValues.y,
    width: formValues.width,
    height: formValues.height,
    addShadow: formValues.addShadow,
    layerPlacement: formValues.layerPlacement,
  }) ?? {}
}

export function normalizeImageLayerSpecFromForm(formValues) {
  return normalizeImageLayerSpec({
    src: formValues.src,
    x: formValues.x,
    y: formValues.y,
    width: formValues.width,
    height: formValues.height,
    opacity: formValues.opacity,
    rotation: formValues.rotation,
    scaleX: formValues.scaleX,
    scaleY: formValues.scaleY,
    layerPlacement: formValues.layerPlacement,
  })
}

export function parseAddLayerJson(jsonInput) {
  if (typeof jsonInput !== 'string' || !jsonInput.trim()) {
    return {
      error: 'Paste a JSON payload before applying it.',
      textSpecs: [],
      imageSpecs: [],
      textFormValues: getDefaultTextLayerFormValues(),
      imageFormValues: getDefaultImageLayerFormValues(),
    }
  }

  let parsedValue = null

  try {
    parsedValue = JSON.parse(jsonInput)
  } catch {
    return {
      error: 'This JSON payload could not be parsed.',
      textSpecs: [],
      imageSpecs: [],
      textFormValues: getDefaultTextLayerFormValues(),
      imageFormValues: getDefaultImageLayerFormValues(),
    }
  }

  if (!isRecord(parsedValue)) {
    return {
      error: 'The JSON payload must be an object with optional texts and images arrays.',
      textSpecs: [],
      imageSpecs: [],
      textFormValues: getDefaultTextLayerFormValues(),
      imageFormValues: getDefaultImageLayerFormValues(),
    }
  }

  const textSpecs = Array.isArray(parsedValue.texts)
    ? parsedValue.texts.map(normalizeJsonTextLayerSpec).filter(Boolean)
    : []
  const imageSpecs = Array.isArray(parsedValue.images)
    ? parsedValue.images.map(normalizeImageLayerSpec).filter(Boolean)
    : []

  if (textSpecs.length === 0 && imageSpecs.length === 0) {
    return {
      error: 'The JSON payload did not contain any valid text or image layer specs.',
      textSpecs: [],
      imageSpecs: [],
      textFormValues: getDefaultTextLayerFormValues(),
      imageFormValues: getDefaultImageLayerFormValues(),
    }
  }

  return {
    error: null,
    textSpecs,
    imageSpecs,
    textFormValues: textSpecs[0]
      ? buildTextFormValuesFromSpec(textSpecs[0])
      : getDefaultTextLayerFormValues(),
    imageFormValues: imageSpecs[0]
      ? buildImageFormValuesFromSpec(imageSpecs[0])
      : getDefaultImageLayerFormValues(),
  }
}
