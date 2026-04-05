const TEXT_MEASURE_CANVAS = document.createElement('canvas')
const TEXT_MEASURE_CONTEXT = TEXT_MEASURE_CANVAS.getContext('2d')

export const DEFAULT_TEXT_LINE_HEIGHT = 1.15
export const DEFAULT_TEXT_LETTER_SPACING = 0
export const DEFAULT_TEXT_ALIGN = 'left'
export const DEFAULT_TEXT_MODE = 'box'
const POINT_TEXT_HORIZONTAL_PADDING = 8

function getMeasureContext() {
  if (!TEXT_MEASURE_CONTEXT) {
    throw new Error('Canvas text measurement is unavailable')
  }

  return TEXT_MEASURE_CONTEXT
}

export function getTextFont(layer) {
  const fontStyle = layer.fontStyle ? `${layer.fontStyle} ` : ''
  const fontWeight = layer.fontWeight ? `${layer.fontWeight} ` : ''
  return `${fontStyle}${fontWeight}${layer.fontSize}px ${layer.fontFamily}`
}

export function measureTextWidth(context, text, letterSpacing = 0) {
  if (!text) {
    return 0
  }

  const glyphs = Array.from(text)
  const baseWidth = context.measureText(glyphs.join('')).width
  const extraSpacing = Math.max(glyphs.length - 1, 0) * letterSpacing
  return baseWidth + extraSpacing
}

function wrapParagraphToWidth(context, paragraph, maxWidth, letterSpacing) {
  if (!paragraph) {
    return ['']
  }

  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return [paragraph]
  }

  const words = paragraph.split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return ['']
  }

  const lines = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    const nextLineWidth = measureTextWidth(context, nextLine, letterSpacing)

    if (currentLine && nextLineWidth > maxWidth) {
      lines.push(currentLine)
      currentLine = word
      continue
    }

    currentLine = nextLine
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

export function wrapTextToWidth(context, text, maxWidth, letterSpacing = 0) {
  return String(text ?? '')
    .split('\n')
    .flatMap((paragraph) => wrapParagraphToWidth(context, paragraph, maxWidth, letterSpacing))
}

export function measureTextLayer(layer) {
  const context = getMeasureContext()
  context.font = getTextFont(layer)

  const letterSpacing = layer.letterSpacing ?? DEFAULT_TEXT_LETTER_SPACING
  const lineHeight = layer.fontSize * (layer.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT)
  const mode = layer.mode ?? DEFAULT_TEXT_MODE
  const maxWidth = mode === 'box' ? Math.max(layer.boxWidth ?? 0, 1) : null
  const lines = mode === 'box'
    ? wrapTextToWidth(context, layer.text, maxWidth, letterSpacing)
    : String(layer.text ?? '').split('\n')

  const measuredLineWidth = lines.reduce((largestWidth, line) => (
    Math.max(largestWidth, measureTextWidth(context, line, letterSpacing))
  ), 0)

  const measuredWidth = mode === 'box'
    ? Math.max(maxWidth ?? measuredLineWidth, 1)
    : measuredLineWidth
  const measuredHeight = Math.max(lines.length, 1) * lineHeight

  return {
    width: Math.ceil(measuredWidth + POINT_TEXT_HORIZONTAL_PADDING),
    height: Math.ceil(measuredHeight + 8),
    lines,
    lineHeight,
  }
}

function getPointTextAnchorX(layer) {
  const contentWidth = Math.max((layer.width ?? 0) - POINT_TEXT_HORIZONTAL_PADDING, 0)
  const textAlign = layer.textAlign ?? DEFAULT_TEXT_ALIGN

  if (textAlign === 'center') {
    return layer.x + (contentWidth / 2)
  }

  if (textAlign === 'right') {
    return layer.x + contentWidth
  }

  return layer.x
}

function getPointTextXFromAnchor(anchorX, width, textAlign) {
  const contentWidth = Math.max((width ?? 0) - POINT_TEXT_HORIZONTAL_PADDING, 0)

  if (textAlign === 'center') {
    return anchorX - (contentWidth / 2)
  }

  if (textAlign === 'right') {
    return anchorX - contentWidth
  }

  return anchorX
}

function preservePointTextAnchor(previousLayer, nextLayer) {
  if (!previousLayer || previousLayer.mode !== 'point' || nextLayer.mode !== 'point') {
    return nextLayer
  }

  const anchorX = getPointTextAnchorX(previousLayer)

  return {
    ...nextLayer,
    x: getPointTextXFromAnchor(anchorX, nextLayer.width, nextLayer.textAlign ?? DEFAULT_TEXT_ALIGN),
  }
}

export function syncTextLayerLayout(layer, previousLayer = null) {
  const measurement = measureTextLayer(layer)
  const normalizedBoxWidth = layer.mode === 'box'
    ? Math.max(layer.boxWidth ?? measurement.width, 1)
    : null
  const normalizedBoxHeight = layer.mode === 'box'
    ? Math.max(layer.boxHeight ?? measurement.height, measurement.height, 1)
    : null

  const nextLayer = {
    ...layer,
    boxWidth: normalizedBoxWidth,
    boxHeight: normalizedBoxHeight,
    measuredWidth: measurement.width,
    measuredHeight: measurement.height,
    width: layer.mode === 'box' ? normalizedBoxWidth : measurement.width,
    height: layer.mode === 'box' ? normalizedBoxHeight : measurement.height,
  }

  return preservePointTextAnchor(previousLayer, nextLayer)
}

export function updateTextContent(layer, text) {
  return syncTextLayerLayout({
    ...layer,
    text,
    name: String(text ?? '').replace(/\s+/g, ' ').trim() || 'New Text',
  }, layer)
}

export function updateTextStyle(layer, updates) {
  return syncTextLayerLayout({
    ...layer,
    ...updates,
  }, layer)
}

export function updateTextLayerFont(layer, fontFamily) {
  return updateTextStyle(layer, { fontFamily })
}

export function resizePointTextTransform(layer, scaleX, scaleY) {
  return {
    ...layer,
    scaleX,
    scaleY,
  }
}

export function resizeBoxText(layer, newBoxWidth, newBoxHeight = null) {
  return syncTextLayerLayout({
    ...layer,
    mode: 'box',
    boxWidth: Math.max(newBoxWidth, 1),
    boxHeight: newBoxHeight,
  }, layer)
}

export function getTextBounds(layer) {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  }
}

export function renderTextLayer(context, layer) {
  const measurement = measureTextLayer(layer)
  const letterSpacing = layer.letterSpacing ?? DEFAULT_TEXT_LETTER_SPACING
  const textAlign = layer.textAlign ?? DEFAULT_TEXT_ALIGN
  const availableWidth = layer.mode === 'box'
    ? layer.width
    : Math.max(measurement.width - POINT_TEXT_HORIZONTAL_PADDING, 0)
  const drawX = textAlign === 'center'
    ? availableWidth / 2
    : textAlign === 'right'
      ? availableWidth
      : 0

  context.save()
  context.clearRect(0, 0, layer.width, layer.height)
  context.fillStyle = layer.color
  context.font = getTextFont(layer)
  context.textBaseline = 'top'
  context.textAlign = textAlign

  measurement.lines.forEach((line, index) => {
    const y = index * measurement.lineHeight

    if (letterSpacing === 0) {
      context.fillText(line, drawX, y)
      return
    }

    const lineWidth = measureTextWidth(context, line, letterSpacing)
    let glyphX = textAlign === 'center'
      ? (availableWidth - lineWidth) / 2
      : textAlign === 'right'
        ? availableWidth - lineWidth
        : 0

    for (const glyph of Array.from(line)) {
      context.fillText(glyph, glyphX, y)
      glyphX += context.measureText(glyph).width + letterSpacing
    }
  })

  context.restore()
}
