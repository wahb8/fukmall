const TEXT_MEASURE_CANVAS = document.createElement('canvas')
const TEXT_MEASURE_CONTEXT = TEXT_MEASURE_CANVAS.getContext('2d')

export const DEFAULT_TEXT_LINE_HEIGHT = 1.15
export const DEFAULT_TEXT_LETTER_SPACING = 0
export const DEFAULT_TEXT_ALIGN = 'left'
export const DEFAULT_TEXT_MODE = 'box'
export const PARTIAL_TEXT_STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'color',
  'strokeColor',
  'strokeWidth',
]
const POINT_TEXT_HORIZONTAL_PADDING = 8
const TEXT_VERTICAL_PADDING_TOP = 4
const TEXT_VERTICAL_PADDING_BOTTOM = 4

function compareStyleValues(firstValue, secondValue) {
  if (Number.isFinite(firstValue) || Number.isFinite(secondValue)) {
    return Number(firstValue) === Number(secondValue)
  }

  return firstValue === secondValue
}

function haveSameStyleOverrides(firstStyles, secondStyles) {
  const firstKeys = Object.keys(firstStyles ?? {}).sort()
  const secondKeys = Object.keys(secondStyles ?? {}).sort()

  if (firstKeys.length !== secondKeys.length) {
    return false
  }

  return firstKeys.every((key, index) => (
    key === secondKeys[index] &&
    compareStyleValues(firstStyles[key], secondStyles[key])
  ))
}

export function normalizeTextStyleOverrides(styles) {
  if (!styles || typeof styles !== 'object') {
    return {}
  }

  return PARTIAL_TEXT_STYLE_KEYS.reduce((nextStyles, key) => {
    if (!(key in styles)) {
      return nextStyles
    }

    const value = styles[key]

    if (value === null || value === undefined) {
      return nextStyles
    }

    if ((key === 'fontSize' || key === 'lineHeight') && !Number.isFinite(Number(value))) {
      return nextStyles
    }

    if ((key === 'fontWeight' || key === 'letterSpacing' || key === 'strokeWidth') && !Number.isFinite(Number(value))) {
      return nextStyles
    }

    if (
      (key === 'fontFamily' || key === 'fontStyle' || key === 'color' || key === 'strokeColor') &&
      typeof value !== 'string'
    ) {
      return nextStyles
    }

    return {
      ...nextStyles,
      [key]: (
        key === 'fontSize' ||
        key === 'fontWeight' ||
        key === 'lineHeight' ||
        key === 'letterSpacing' ||
        key === 'strokeWidth'
      )
          ? Number(value)
          : value
      ,
    }
  }, {})
}

export function normalizeTextStyleRanges(styleRanges, textLength) {
  const safeTextLength = Math.max(0, Number(textLength) || 0)
  const safeRanges = Array.isArray(styleRanges) ? styleRanges : []
  const boundaries = new Set([0, safeTextLength])
  const normalizedRanges = safeRanges.flatMap((range) => {
    const start = Math.max(0, Math.min(safeTextLength, Math.floor(Number(range?.start) || 0)))
    const end = Math.max(0, Math.min(safeTextLength, Math.floor(Number(range?.end) || 0)))
    const styles = normalizeTextStyleOverrides(range?.styles)

    if (end <= start || Object.keys(styles).length === 0) {
      return []
    }

    boundaries.add(start)
    boundaries.add(end)

    return [{
      start,
      end,
      styles,
    }]
  })
  const orderedBoundaries = Array.from(boundaries).sort((first, second) => first - second)
  const mergedRanges = []

  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const start = orderedBoundaries[index]
    const end = orderedBoundaries[index + 1]

    if (end <= start) {
      continue
    }

    const styles = normalizedRanges.reduce((currentStyles, range) => (
      range.start <= start && range.end >= end
        ? { ...currentStyles, ...range.styles }
        : currentStyles
    ), {})

    if (Object.keys(styles).length === 0) {
      continue
    }

    const previousRange = mergedRanges.at(-1)

    if (previousRange && previousRange.end === start && haveSameStyleOverrides(previousRange.styles, styles)) {
      previousRange.end = end
      continue
    }

    mergedRanges.push({ start, end, styles })
  }

  return mergedRanges
}

export function remapTextStyleRangesForTextChange(previousText, nextText, styleRanges) {
  const previousValue = String(previousText ?? '')
  const nextValue = String(nextText ?? '')
  const normalizedRanges = normalizeTextStyleRanges(styleRanges, previousValue.length)

  if (normalizedRanges.length === 0 || previousValue === nextValue) {
    return normalizeTextStyleRanges(normalizedRanges, nextValue.length)
  }

  let prefixLength = 0

  while (
    prefixLength < previousValue.length &&
    prefixLength < nextValue.length &&
    previousValue[prefixLength] === nextValue[prefixLength]
  ) {
    prefixLength += 1
  }

  let suffixLength = 0

  while (
    suffixLength < previousValue.length - prefixLength &&
    suffixLength < nextValue.length - prefixLength &&
    previousValue[previousValue.length - 1 - suffixLength] === nextValue[nextValue.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  const previousChangedEnd = previousValue.length - suffixLength
  const nextChangedEnd = nextValue.length - suffixLength
  const lengthDelta = nextChangedEnd - previousChangedEnd
  const nextRanges = []

  for (const range of normalizedRanges) {
    if (range.end <= prefixLength) {
      nextRanges.push(range)
      continue
    }

    if (range.start >= previousChangedEnd) {
      nextRanges.push({
        ...range,
        start: range.start + lengthDelta,
        end: range.end + lengthDelta,
      })
      continue
    }

    if (range.start < prefixLength) {
      nextRanges.push({
        ...range,
        start: range.start,
        end: prefixLength,
      })
    }

    const insertionTouchesRange = (
      nextChangedEnd > prefixLength &&
      (
        (range.start < previousChangedEnd && range.end > prefixLength) ||
        (previousChangedEnd === prefixLength && range.start < prefixLength && range.end > prefixLength)
      )
    )

    if (insertionTouchesRange) {
      nextRanges.push({
        ...range,
        start: prefixLength,
        end: nextChangedEnd,
      })
    }

    if (range.end > previousChangedEnd) {
      nextRanges.push({
        ...range,
        start: nextChangedEnd,
        end: range.end + lengthDelta,
      })
    }
  }

  return normalizeTextStyleRanges(nextRanges, nextValue.length)
}

export function applyTextStyleToRange(layer, start, end, stylesOrUpdater) {
  const textLength = String(layer?.text ?? '').length
  const normalizedStart = Math.max(0, Math.min(textLength, Math.floor(Number(start) || 0)))
  const normalizedEnd = Math.max(0, Math.min(textLength, Math.floor(Number(end) || 0)))

  if (normalizedEnd <= normalizedStart) {
    return layer
  }

  const nextStyles = typeof stylesOrUpdater === 'function'
    ? null
    : normalizeTextStyleOverrides(stylesOrUpdater)

  if (nextStyles && Object.keys(nextStyles).length === 0) {
    return layer
  }

  const nextSegments = getEffectiveTextStyleSegments(layer, [normalizedStart, normalizedEnd]).map((segment) => {
    if (segment.end <= normalizedStart || segment.start >= normalizedEnd) {
      return segment
    }

    const nextStyle = typeof stylesOrUpdater === 'function'
      ? getResolvedTextStyle(layer, stylesOrUpdater(segment.style))
      : getResolvedTextStyle(layer, {
        ...segment.style,
        ...nextStyles,
      })

    return {
      ...segment,
      style: nextStyle,
    }
  })

  return syncTextLayerLayout({
    ...layer,
    styleRanges: rebuildTextStyleRangesFromSegments(layer, nextSegments),
  }, layer)
}

export function isTextStyleActiveAcrossRange(layer, start, end, predicate) {
  const textLength = String(layer?.text ?? '').length
  const normalizedStart = Math.max(0, Math.min(textLength, Math.floor(Number(start) || 0)))
  const normalizedEnd = Math.max(0, Math.min(textLength, Math.floor(Number(end) || 0)))

  if (normalizedEnd <= normalizedStart) {
    return false
  }

  return getEffectiveTextStyleSegments(layer, [normalizedStart, normalizedEnd])
    .filter((segment) => segment.end > normalizedStart && segment.start < normalizedEnd)
    .every((segment) => predicate(segment.style))
}

export function isTextRangeFullyBold(layer, start, end) {
  return isTextStyleActiveAcrossRange(
    layer,
    start,
    end,
    (style) => Number(style.fontWeight) >= 700,
  )
}

export function getUniformTextStyleValueForRange(layer, start, end, key) {
  const textLength = String(layer?.text ?? '').length
  const normalizedStart = Math.max(0, Math.min(textLength, Math.floor(Number(start) || 0)))
  const normalizedEnd = Math.max(0, Math.min(textLength, Math.floor(Number(end) || 0)))

  if (normalizedEnd <= normalizedStart) {
    return getResolvedTextStyle(layer)[key]
  }

  const intersectingSegments = getEffectiveTextStyleSegments(layer, [normalizedStart, normalizedEnd])
    .filter((segment) => segment.end > normalizedStart && segment.start < normalizedEnd)

  if (intersectingSegments.length === 0) {
    return getResolvedTextStyle(layer)[key]
  }

  const firstValue = intersectingSegments[0].style[key]
  const isUniform = intersectingSegments.every((segment) => compareStyleValues(segment.style[key], firstValue))

  return isUniform ? firstValue : null
}

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

function getResolvedTextStyle(layer, overrides = {}) {
  const mergedStyle = {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle,
    lineHeight: layer.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT,
    letterSpacing: layer.letterSpacing ?? DEFAULT_TEXT_LETTER_SPACING,
    color: layer.color,
    strokeColor: layer.textStrokeColor ?? layer.strokeColor ?? null,
    strokeWidth: Math.max(0, Number(layer.textStrokeWidth ?? layer.strokeWidth ?? 0) || 0),
    ...overrides,
  }

  return {
    ...mergedStyle,
    fontSize: Math.max(1, Number(mergedStyle.fontSize) || 1),
    fontWeight: Number.isFinite(Number(mergedStyle.fontWeight))
      ? Number(mergedStyle.fontWeight)
      : mergedStyle.fontWeight,
    lineHeight: Math.max(0.1, Number(mergedStyle.lineHeight) || DEFAULT_TEXT_LINE_HEIGHT),
    letterSpacing: Number(mergedStyle.letterSpacing) || 0,
    strokeWidth: Math.max(0, Number(mergedStyle.strokeWidth) || 0),
  }
}

function getRangeBoundaries(layer, extraBoundaries = []) {
  const textLength = String(layer?.text ?? '').length
  const boundaries = new Set([0, textLength])

  for (const range of normalizeTextStyleRanges(layer?.styleRanges, textLength)) {
    boundaries.add(range.start)
    boundaries.add(range.end)
  }

  for (const boundary of extraBoundaries) {
    if (!Number.isFinite(Number(boundary))) {
      continue
    }

    boundaries.add(Math.max(0, Math.min(textLength, Math.floor(Number(boundary)))))
  }

  return Array.from(boundaries).sort((first, second) => first - second)
}

function getStyleOverridesForSlice(ranges, start, end) {
  return ranges.reduce((currentStyles, range) => (
    range.start <= start && range.end >= end
      ? { ...currentStyles, ...range.styles }
      : currentStyles
  ), {})
}

function stripBaseTextStyleOverrides(baseStyle, effectiveStyle) {
  return PARTIAL_TEXT_STYLE_KEYS.reduce((nextOverrides, key) => {
    if (compareStyleValues(effectiveStyle[key], baseStyle[key])) {
      return nextOverrides
    }

    return {
      ...nextOverrides,
      [key]: effectiveStyle[key],
    }
  }, {})
}

export function getEffectiveTextStyleSegments(layer, extraBoundaries = []) {
  const text = String(layer?.text ?? '')
  const ranges = normalizeTextStyleRanges(layer?.styleRanges, text.length)
  const boundaries = getRangeBoundaries(layer, extraBoundaries)

  return boundaries.flatMap((start, index) => {
    const end = boundaries[index + 1]

    if (!Number.isFinite(end) || end <= start) {
      return []
    }

    const segmentText = text.slice(start, end)

    if (!segmentText) {
      return []
    }

    return [{
      start,
      end,
      text: segmentText,
      style: getResolvedTextStyle(layer, getStyleOverridesForSlice(ranges, start, end)),
    }]
  })
}

function rebuildTextStyleRangesFromSegments(layer, segments) {
  const baseStyle = getResolvedTextStyle(layer)

  return normalizeTextStyleRanges(
    segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      styles: stripBaseTextStyleOverrides(baseStyle, segment.style),
    })),
    String(layer?.text ?? '').length,
  )
}

function getTextFontFromStyle(style) {
  const fontStyle = style.fontStyle ? `${style.fontStyle} ` : ''
  const fontWeight = style.fontWeight ? `${style.fontWeight} ` : ''
  return `${fontStyle}${fontWeight}${style.fontSize}px ${style.fontFamily}`
}

function getTextStyleMetrics(context, style, metricsCache) {
  const cacheKey = getRunStyleKey(style)

  if (metricsCache?.has(cacheKey)) {
    return metricsCache.get(cacheKey)
  }

  context.font = getTextFontFromStyle(style)
  const metrics = context.measureText('Mg')
  const fallbackAscent = style.fontSize * 0.8
  const fallbackDescent = style.fontSize * 0.2
  const resolvedMetrics = {
    ascent: Math.max(
      Number(metrics.actualBoundingBoxAscent) || 0,
      fallbackAscent,
    ),
    descent: Math.max(
      Number(metrics.actualBoundingBoxDescent) || 0,
      fallbackDescent,
    ),
  }

  metricsCache?.set(cacheKey, resolvedMetrics)

  return resolvedMetrics
}

export async function loadTextLayerFont(layer) {
  if (
    typeof document === 'undefined' ||
    !document.fonts ||
    typeof document.fonts.load !== 'function'
  ) {
    return
  }

  const sampleText = String(layer?.text ?? ' ').trim() || ' '
  const stylesToLoad = []
  const seenFonts = new Set()

  for (const styleOverride of [
    null,
    ...normalizeTextStyleRanges(layer?.styleRanges, String(layer?.text ?? '').length).map((range) => range.styles),
  ]) {
    const style = getResolvedTextStyle(layer, styleOverride ?? {})
    const fontKey = getTextFontFromStyle(style)

    if (seenFonts.has(fontKey)) {
      continue
    }

    seenFonts.add(fontKey)
    stylesToLoad.push(fontKey)
  }

  try {
    await Promise.all(stylesToLoad.map((font) => document.fonts.load(font, sampleText)))
  } catch {
    // Fall back to the browser's available font stack.
  }
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

function getRunStyleKey(style) {
  return [
    style.fontFamily,
    style.fontSize,
    style.fontWeight,
    style.fontStyle,
    style.lineHeight,
    style.letterSpacing,
    style.color,
    style.strokeColor ?? '',
    style.strokeWidth,
  ].join('|')
}

function createStyledTextRuns(layer) {
  return getEffectiveTextStyleSegments(layer)
}

function createStyledCharacters(layer, context) {
  const runs = createStyledTextRuns(layer)
  const characters = []
  let currentIndex = 0

  for (const run of runs) {
    context.font = getTextFontFromStyle(run.style)

    for (const character of Array.from(run.text)) {
      const startIndex = currentIndex
      const endIndex = startIndex + character.length

      characters.push({
        char: character,
        style: run.style,
        width: context.measureText(character).width,
        startIndex,
        endIndex,
      })
      currentIndex = endIndex
    }
  }

  return characters
}

function getCharacterSequenceWidth(characters) {
  if (!characters.length) {
    return 0
  }

  return characters.reduce((totalWidth, character, index) => (
    totalWidth +
    character.width +
    (index < characters.length - 1 ? character.style.letterSpacing : 0)
  ), 0)
}

function createTokenFromCharacters(characters) {
  return {
    characters,
    type: /\s/.test(characters[0]?.char ?? '') ? 'space' : 'word',
    width: getCharacterSequenceWidth(characters),
  }
}

function tokenizeParagraphCharacters(characters) {
  if (!characters.length) {
    return []
  }

  const tokens = []
  let currentCharacters = [characters[0]]
  let currentIsWhitespace = /\s/.test(characters[0].char)

  for (const character of characters.slice(1)) {
    const isWhitespace = /\s/.test(character.char)

    if (isWhitespace === currentIsWhitespace) {
      currentCharacters.push(character)
      continue
    }

    tokens.push(createTokenFromCharacters(currentCharacters))
    currentCharacters = [character]
    currentIsWhitespace = isWhitespace
  }

  tokens.push(createTokenFromCharacters(currentCharacters))

  return tokens
}

function createRunsFromCharacters(characters) {
  if (!characters.length) {
    return []
  }

  const runs = []
  let currentRun = {
    style: characters[0].style,
    text: characters[0].char,
    characters: [characters[0]],
    width: characters[0].width,
    advanceWidth: characters[0].width,
  }

  for (const [index, character] of characters.slice(1).entries()) {
    const actualIndex = index + 1
    const previousCharacter = characters[actualIndex - 1]

    if (getRunStyleKey(character.style) === getRunStyleKey(currentRun.style)) {
      currentRun.text += character.char
      currentRun.characters.push(character)
      currentRun.width += previousCharacter.style.letterSpacing + character.width
      currentRun.advanceWidth += previousCharacter.style.letterSpacing + character.width
      continue
    }

    currentRun.advanceWidth += previousCharacter.style.letterSpacing
    runs.push(currentRun)
    currentRun = {
      style: character.style,
      text: character.char,
      characters: [character],
      width: character.width,
      advanceWidth: character.width,
    }
  }

  runs.push(currentRun)

  return runs
}

function finalizeLayoutLine(characters, fallbackStyle, context, metricsCache) {
  const lineCharacters = Array.isArray(characters) ? characters : []
  const fallbackMetrics = getTextStyleMetrics(context, fallbackStyle, metricsCache)
  const lineMetrics = lineCharacters.reduce((largestMetrics, character) => {
    const characterMetrics = getTextStyleMetrics(context, character.style, metricsCache)

    return {
      ascent: Math.max(largestMetrics.ascent, characterMetrics.ascent),
      descent: Math.max(largestMetrics.descent, characterMetrics.descent),
      lineHeight: Math.max(
        largestMetrics.lineHeight,
        character.style.fontSize * character.style.lineHeight,
      ),
    }
  }, {
    ascent: fallbackMetrics.ascent,
    descent: fallbackMetrics.descent,
    lineHeight: fallbackStyle.fontSize * fallbackStyle.lineHeight,
  })
  const contentHeight = lineMetrics.ascent + lineMetrics.descent
  const lineHeight = Math.max(lineMetrics.lineHeight, contentHeight)
  const baselineOffset = ((lineHeight - contentHeight) / 2) + lineMetrics.ascent

  return {
    text: lineCharacters.map((character) => character.char).join(''),
    characters: lineCharacters,
    runs: createRunsFromCharacters(lineCharacters),
    width: getCharacterSequenceWidth(lineCharacters),
    lineHeight,
    ascent: lineMetrics.ascent,
    descent: lineMetrics.descent,
    baselineOffset,
  }
}

function splitTokenToFitWidth(token, maxWidth) {
  const fragments = []
  let currentCharacters = []

  for (const character of token.characters) {
    const nextCharacters = [...currentCharacters, character]
    const nextWidth = getCharacterSequenceWidth(nextCharacters)

    if (currentCharacters.length > 0 && nextWidth > maxWidth) {
      fragments.push(createTokenFromCharacters(currentCharacters))
      currentCharacters = [character]
      continue
    }

    currentCharacters = nextCharacters
  }

  if (currentCharacters.length > 0) {
    fragments.push(createTokenFromCharacters(currentCharacters))
  }

  return fragments
}

function layoutParagraphTokens(tokens, maxWidth, fallbackStyle, context, metricsCache) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return [finalizeLayoutLine(tokens.flatMap((token) => token.characters), fallbackStyle, context, metricsCache)]
  }

  if (tokens.length === 0) {
    return [finalizeLayoutLine([], fallbackStyle, context, metricsCache)]
  }

  const lines = []
  let currentCharacters = []

  function pushCurrentLine() {
    lines.push(finalizeLayoutLine(currentCharacters, fallbackStyle, context, metricsCache))
    currentCharacters = []
  }

  for (const token of tokens) {
    if (token.type === 'space' && currentCharacters.length === 0) {
      continue
    }

    const nextCharacters = [...currentCharacters, ...token.characters]
    const nextWidth = getCharacterSequenceWidth(nextCharacters)

    if (token.type === 'word' && currentCharacters.length > 0 && nextWidth > maxWidth) {
      pushCurrentLine()
    }

    if (token.width > maxWidth) {
      const fragments = splitTokenToFitWidth(token, maxWidth)

      for (const fragment of fragments) {
        const candidateCharacters = [...currentCharacters, ...fragment.characters]
        const candidateWidth = getCharacterSequenceWidth(candidateCharacters)

        if (currentCharacters.length > 0 && candidateWidth > maxWidth) {
          pushCurrentLine()
        }

        currentCharacters = [...currentCharacters, ...fragment.characters]

        if (getCharacterSequenceWidth(currentCharacters) >= maxWidth) {
          pushCurrentLine()
        }
      }

      continue
    }

    currentCharacters = [...currentCharacters, ...token.characters]
  }

  if (currentCharacters.length > 0 || lines.length === 0) {
    pushCurrentLine()
  }

  return lines
}

function createTextLayout(layer) {
  const context = getMeasureContext()
  const metricsCache = new Map()
  const fallbackStyle = getResolvedTextStyle(layer)
  const mode = layer.mode ?? DEFAULT_TEXT_MODE
  const maxWidth = mode === 'box' ? Math.max(layer.boxWidth ?? 0, 1) : null
  const allCharacters = createStyledCharacters(layer, context)
  const paragraphs = []
  let currentParagraph = []

  for (const character of allCharacters) {
    if (character.char === '\n') {
      paragraphs.push(currentParagraph)
      currentParagraph = []
      continue
    }

    currentParagraph.push(character)
  }

  paragraphs.push(currentParagraph)

  const lines = mode === 'box'
    ? paragraphs.flatMap((paragraph) => (
      layoutParagraphTokens(tokenizeParagraphCharacters(paragraph), maxWidth, fallbackStyle, context, metricsCache)
    ))
    : paragraphs.map((paragraph) => finalizeLayoutLine(paragraph, fallbackStyle, context, metricsCache))
  const measuredLineWidth = lines.reduce((largestWidth, line) => Math.max(largestWidth, line.width), 0)
  const measuredWidth = mode === 'box'
    ? Math.max(maxWidth ?? measuredLineWidth, 1)
    : measuredLineWidth
  const measuredHeight = lines.reduce((totalHeight, line) => totalHeight + line.lineHeight, 0)

  return {
    width: Math.ceil(measuredWidth + POINT_TEXT_HORIZONTAL_PADDING),
    height: Math.ceil(measuredHeight + TEXT_VERTICAL_PADDING_TOP + TEXT_VERTICAL_PADDING_BOTTOM),
    lines: lines.map((line) => line.text),
    layoutLines: lines,
  }
}

function drawStyledRun(context, run, x, y) {
  context.font = getTextFontFromStyle(run.style)
  context.fillStyle = run.style.color

  if (run.style.strokeWidth > 0 && run.style.strokeColor) {
    context.lineWidth = run.style.strokeWidth
    context.strokeStyle = run.style.strokeColor
  }

  if (run.style.letterSpacing === 0) {
    if (run.style.strokeWidth > 0 && run.style.strokeColor) {
      context.strokeText(run.text, x, y)
    }

    context.fillText(run.text, x, y)
    return
  }

  let glyphX = x
  const glyphs = Array.from(run.text)

  for (const glyph of glyphs) {
    if (run.style.strokeWidth > 0 && run.style.strokeColor) {
      context.strokeText(glyph, glyphX, y)
    }

    context.fillText(glyph, glyphX, y)
    glyphX += context.measureText(glyph).width + run.style.letterSpacing
  }
}

export function measureTextLayer(layer) {
  const layout = createTextLayout(layer)

  return {
    width: layout.width,
    height: layout.height,
    lines: layout.lines,
    lineHeight: layout.layoutLines[0]?.lineHeight ?? (
      getResolvedTextStyle(layer).fontSize * getResolvedTextStyle(layer).lineHeight
    ),
    layoutLines: layout.layoutLines,
  }
}

export function getTextEditorOverlayGeometry(layer, selectionStart, selectionEnd) {
  const measurement = measureTextLayer(layer)
  const textAlign = layer.textAlign ?? DEFAULT_TEXT_ALIGN
  const availableWidth = layer.mode === 'box'
    ? layer.width
    : Math.max(measurement.width - POINT_TEXT_HORIZONTAL_PADDING, 0)
  const normalizedStart = Math.max(0, Math.floor(Number(selectionStart) || 0))
  const normalizedEnd = Math.max(0, Math.floor(Number(selectionEnd) || 0))
  const selectionRects = []
  let caretRect = null
  let currentY = TEXT_VERTICAL_PADDING_TOP

  function getLineDrawX(line) {
    return textAlign === 'center'
      ? (availableWidth - line.width) / 2
      : textAlign === 'right'
        ? availableWidth - line.width
        : 0
  }

  for (const line of measurement.layoutLines ?? []) {
    const drawX = getLineDrawX(line)
    let currentX = drawX
    let lineSelectionStart = null
    let lineSelectionEnd = null

    if (line.characters.length === 0) {
      if (normalizedStart === normalizedEnd && caretRect === null) {
        caretRect = {
          x: drawX,
          y: currentY,
          height: line.lineHeight,
        }
      }

      currentY += line.lineHeight
      continue
    }

    for (const [index, character] of line.characters.entries()) {
      const advanceWidth = character.width + (
        index < line.characters.length - 1 ? character.style.letterSpacing : 0
      )
      const charStartX = currentX
      const charEndX = currentX + advanceWidth

      if (normalizedStart >= character.startIndex && normalizedStart <= character.endIndex) {
        caretRect = normalizedStart === normalizedEnd
          ? {
            x: normalizedStart === character.endIndex ? charEndX : charStartX,
            y: currentY,
            height: line.lineHeight,
          }
          : caretRect
      }

      const overlapsSelection = normalizedEnd > character.startIndex && normalizedStart < character.endIndex

      if (overlapsSelection) {
        lineSelectionStart = lineSelectionStart ?? charStartX
        lineSelectionEnd = charEndX
      }

      currentX = charEndX
    }

    const lastCharacter = line.characters.at(-1)

    if (
      normalizedStart === normalizedEnd &&
      caretRect === null &&
      lastCharacter &&
      normalizedStart >= lastCharacter.endIndex
    ) {
      caretRect = {
        x: drawX + line.width,
        y: currentY,
        height: line.lineHeight,
      }
    }

    if (lineSelectionStart !== null && lineSelectionEnd !== null && lineSelectionEnd > lineSelectionStart) {
      selectionRects.push({
        x: lineSelectionStart,
        y: currentY,
        width: lineSelectionEnd - lineSelectionStart,
        height: line.lineHeight,
      })
    }

    currentY += line.lineHeight
  }

  if (
    normalizedStart === normalizedEnd &&
    caretRect === null &&
    measurement.layoutLines?.length
  ) {
    const lastLine = measurement.layoutLines.at(-1)

    if (lastLine) {
      caretRect = {
        x: getLineDrawX(lastLine) + lastLine.width,
        y: currentY - lastLine.lineHeight,
        height: lastLine.lineHeight,
      }
    }
  }

  return {
    selectionRects,
    caretRect,
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
    styleRanges: normalizeTextStyleRanges(layer.styleRanges, String(layer.text ?? '').length),
  }

  return preservePointTextAnchor(previousLayer, nextLayer)
}

export function updateTextContent(layer, text) {
  return syncTextLayerLayout({
    ...layer,
    text,
    name: String(text ?? '').replace(/\s+/g, ' ').trim() || 'New Text',
    styleRanges: remapTextStyleRangesForTextChange(layer.text, text, layer.styleRanges),
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
  const textAlign = layer.textAlign ?? DEFAULT_TEXT_ALIGN
  const availableWidth = layer.mode === 'box'
    ? layer.width
    : Math.max(measurement.width - POINT_TEXT_HORIZONTAL_PADDING, 0)

  context.save()
  context.clearRect(0, 0, layer.width, layer.height)
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'

  let currentY = TEXT_VERTICAL_PADDING_TOP

  for (const line of measurement.layoutLines ?? []) {
    const drawX = textAlign === 'center'
      ? (availableWidth - line.width) / 2
      : textAlign === 'right'
        ? availableWidth - line.width
        : 0
    let currentX = drawX
    const baselineY = currentY + line.baselineOffset

    for (const run of line.runs) {
      drawStyledRun(context, run, currentX, baselineY)
      currentX += run.advanceWidth
    }

    currentY += line.lineHeight
  }

  context.restore()
}
