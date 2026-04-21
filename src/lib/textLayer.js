import { centerToTopLeft, topLeftToCenter } from './layerGeometry'

const TEXT_MEASURE_CANVAS = document.createElement('canvas')
const TEXT_MEASURE_CONTEXT = TEXT_MEASURE_CANVAS.getContext('2d')

export const DEFAULT_TEXT_LINE_HEIGHT = 1.15
export const DEFAULT_TEXT_LETTER_SPACING = 0
export const DEFAULT_TEXT_ALIGN = 'left'
export const DEFAULT_TEXT_MODE = 'box'
export const DEFAULT_TEXT_AUTO_FIT = false
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
const POINT_TEXT_HORIZONTAL_PADDING_LEFT = 4
const POINT_TEXT_HORIZONTAL_PADDING_RIGHT = 4
const TEXT_VERTICAL_PADDING_TOP = 4
const TEXT_VERTICAL_PADDING_BOTTOM = 4
const TEXT_GLYPH_EDGE_BUFFER = 2
const MIN_AUTO_FIT_FONT_SIZE = 1
const MAX_AUTO_FIT_FONT_SIZE = 5000
const RTL_TEXT_CHAR_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/u
const STRONG_LTR_TEXT_CHAR_REGEX = /\p{Letter}/u
const COMPLEX_SHAPING_TEXT_CHAR_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u

function compareStyleValues(firstValue, secondValue) {
  if (Number.isFinite(firstValue) || Number.isFinite(secondValue)) {
    return Number(firstValue) === Number(secondValue)
  }

  return firstValue === secondValue
}

function resolveDetectedTextDirection(text, fallbackDirection = 'ltr') {
  const normalizedFallbackDirection = fallbackDirection === 'rtl' ? 'rtl' : 'ltr'

  for (const character of Array.from(String(text ?? ''))) {
    if (RTL_TEXT_CHAR_REGEX.test(character)) {
      return 'rtl'
    }

    if (STRONG_LTR_TEXT_CHAR_REGEX.test(character)) {
      return 'ltr'
    }
  }

  return normalizedFallbackDirection
}

export function detectTextDirection(text) {
  return resolveDetectedTextDirection(text, 'ltr')
}

export function containsArabicOrRequiresComplexShaping(text) {
  return COMPLEX_SHAPING_TEXT_CHAR_REGEX.test(String(text ?? ''))
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

function scaleTextStyleRangeFontSizes(styleRanges, ratio, textLength) {
  const safeRatio = Number.isFinite(Number(ratio)) && Number(ratio) > 0
    ? Number(ratio)
    : 1

  return normalizeTextStyleRanges(
    normalizeTextStyleRanges(styleRanges, textLength).map((range) => ({
      ...range,
      styles: range.styles.fontSize !== undefined
        ? {
          ...range.styles,
          fontSize: Math.max(
            MIN_AUTO_FIT_FONT_SIZE,
            Number(range.styles.fontSize) * safeRatio,
          ),
        }
        : range.styles,
    })),
    textLength,
  )
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
  const isPureInsertion = previousChangedEnd === prefixLength && nextChangedEnd > prefixLength
  const nextRanges = []

  for (const range of normalizedRanges) {
    const insertionTouchesRangeBoundary = isPureInsertion && range.end === prefixLength

    if (range.end < prefixLength || (range.end === prefixLength && !insertionTouchesRangeBoundary)) {
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

    const insertionTouchesRange = isPureInsertion
      ? range.start <= prefixLength && range.end >= prefixLength
      : (
        nextChangedEnd > prefixLength &&
        range.start < previousChangedEnd &&
        range.end > prefixLength
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

  if (nextStyles) {
    return syncTextLayerLayout({
      ...layer,
      styleRanges: normalizeTextStyleRanges([
        ...normalizeTextStyleRanges(layer?.styleRanges, textLength),
        {
          start: normalizedStart,
          end: normalizedEnd,
          styles: nextStyles,
        },
      ], textLength),
    }, layer)
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

function isBoxTextAutoFitEnabled(layer) {
  return layer?.type === 'text' && layer?.mode === 'box' && layer?.autoFit === true
}

function createAutoFitCandidateLayer(layer, fontSize) {
  const currentFontSize = Math.max(MIN_AUTO_FIT_FONT_SIZE, Number(layer?.fontSize) || 0)
  const nextFontSize = Math.max(MIN_AUTO_FIT_FONT_SIZE, Number(fontSize) || currentFontSize)
  const scaleRatio = nextFontSize / currentFontSize
  const textLength = String(layer?.text ?? '').length

  return {
    ...layer,
    fontSize: nextFontSize,
    styleRanges: scaleTextStyleRangeFontSizes(layer?.styleRanges, scaleRatio, textLength),
  }
}

function measureAutoFitCandidate(layer, fontSize, boxWidth, boxHeight) {
  const candidateLayer = createAutoFitCandidateLayer({
    ...layer,
    width: boxWidth,
    height: boxHeight,
    boxWidth,
    boxHeight,
  }, fontSize)
  const measurement = measureTextLayer(candidateLayer)

  return {
    layer: candidateLayer,
    measurement,
    fits: (
      Number.isFinite(measurement.requiredWidth) &&
      Number.isFinite(measurement.requiredHeight) &&
      measurement.requiredWidth <= boxWidth &&
      measurement.requiredHeight <= boxHeight
    ),
  }
}

function resolveAutoFitFontSize(layer, boxWidth, boxHeight) {
  const textValue = String(layer?.text ?? '')
  const startingFontSize = Math.max(
    MIN_AUTO_FIT_FONT_SIZE,
    Math.min(MAX_AUTO_FIT_FONT_SIZE, Math.round(Number(layer?.fontSize) || 0)),
  )

  if (textValue.length === 0) {
    return measureAutoFitCandidate(layer, startingFontSize, boxWidth, boxHeight)
  }

  const measurementsBySize = new Map()
  const getCandidateResult = (fontSize) => {
    const normalizedFontSize = Math.max(
      MIN_AUTO_FIT_FONT_SIZE,
      Math.min(MAX_AUTO_FIT_FONT_SIZE, Math.round(Number(fontSize) || 0)),
    )

    if (!measurementsBySize.has(normalizedFontSize)) {
      measurementsBySize.set(
        normalizedFontSize,
        measureAutoFitCandidate(layer, normalizedFontSize, boxWidth, boxHeight),
      )
    }

    return measurementsBySize.get(normalizedFontSize)
  }

  const startingResult = getCandidateResult(startingFontSize)

  if (!startingResult.fits) {
    const minimumResult = getCandidateResult(MIN_AUTO_FIT_FONT_SIZE)

    if (!minimumResult.fits) {
      return minimumResult
    }

    let low = MIN_AUTO_FIT_FONT_SIZE
    let high = startingFontSize
    let bestFitResult = minimumResult

    while (low <= high) {
      const candidateFontSize = Math.floor((low + high) / 2)
      const candidateResult = getCandidateResult(candidateFontSize)

      if (candidateResult.fits) {
        bestFitResult = candidateResult
        low = candidateFontSize + 1
      } else {
        high = candidateFontSize - 1
      }
    }

    return bestFitResult
  }

  let fittedFontSize = startingFontSize
  let overflowFontSize = null

  while (fittedFontSize < MAX_AUTO_FIT_FONT_SIZE) {
    const nextFontSize = Math.min(
      MAX_AUTO_FIT_FONT_SIZE,
      Math.max(fittedFontSize + 1, fittedFontSize * 2),
    )
    const nextResult = getCandidateResult(nextFontSize)

    if (!nextResult.fits) {
      overflowFontSize = nextFontSize
      break
    }

    fittedFontSize = nextFontSize

    if (nextFontSize === MAX_AUTO_FIT_FONT_SIZE) {
      return nextResult
    }
  }

  if (overflowFontSize === null) {
    return getCandidateResult(fittedFontSize)
  }

  let low = fittedFontSize
  let high = overflowFontSize
  let bestFitResult = getCandidateResult(fittedFontSize)

  while (low <= high) {
    const candidateFontSize = Math.floor((low + high) / 2)
    const candidateResult = getCandidateResult(candidateFontSize)

    if (candidateResult.fits) {
      bestFitResult = candidateResult
      low = candidateFontSize + 1
    } else {
      high = candidateFontSize - 1
    }
  }

  return bestFitResult
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
  const strokePadding = style.strokeWidth / 2
  const resolvedMetrics = {
    ascent: Math.max(
      Number(metrics.actualBoundingBoxAscent) || 0,
      fallbackAscent,
    ) + strokePadding + TEXT_GLYPH_EDGE_BUFFER,
    descent: Math.max(
      Number(metrics.actualBoundingBoxDescent) || 0,
      fallbackDescent,
    ) + strokePadding + TEXT_GLYPH_EDGE_BUFFER,
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
  if (containsArabicOrRequiresComplexShaping(text)) {
    return baseWidth
  }

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

function getCharacterAdvanceWidth(character, index, characters) {
  return character.width + (
    index < characters.length - 1
      ? character.style.letterSpacing
      : 0
  )
}

function createStyledTextRuns(layer) {
  return getEffectiveTextStyleSegments(layer)
}

function createStyledCharacters(layer, context, metricsCache) {
  const runs = createStyledTextRuns(layer)
  const characters = []
  let currentIndex = 0

  for (const run of runs) {
    context.font = getTextFontFromStyle(run.style)

    for (const character of Array.from(run.text)) {
      const startIndex = currentIndex
      const endIndex = startIndex + character.length
      const metrics = context.measureText(character)
      const fallbackMetrics = getTextStyleMetrics(context, run.style, metricsCache)

      characters.push({
        char: character,
        style: run.style,
        width: metrics.width,
        actualLeft: Math.max(Number(metrics.actualBoundingBoxLeft) || 0, 0),
        actualRight: Math.max(
          Number(metrics.actualBoundingBoxRight) || 0,
          metrics.width,
          0,
        ),
        ascent: Math.max(
          Number(metrics.actualBoundingBoxAscent) || 0,
          fallbackMetrics.ascent,
        ),
        descent: Math.max(
          Number(metrics.actualBoundingBoxDescent) || 0,
          fallbackMetrics.descent,
        ),
        strokePadding: run.style.strokeWidth / 2,
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

function measureCharacterSequenceWidth(context, characters) {
  if (!characters.length) {
    return 0
  }

  return createRunsFromCharacters(characters, context)
    .reduce((totalWidth, run) => totalWidth + run.advanceWidth, 0)
}

function createTokenFromCharacters(characters, context) {
  return {
    characters,
    type: /\s/.test(characters[0]?.char ?? '') ? 'space' : 'word',
    width: measureCharacterSequenceWidth(context, characters),
  }
}

function tokenizeParagraphCharacters(characters, context) {
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

    tokens.push(createTokenFromCharacters(currentCharacters, context))
    currentCharacters = [character]
    currentIsWhitespace = isWhitespace
  }

  tokens.push(createTokenFromCharacters(currentCharacters, context))

  return tokens
}

function measureRunAdvanceWidth(context, text, style) {
  context.font = getTextFontFromStyle(style)
  return measureTextWidth(context, text, style.letterSpacing)
}

function getRunMetrics(context, text, style, metricsCache) {
  context.font = getTextFontFromStyle(style)
  const metrics = context.measureText(text)
  const fallbackMetrics = getTextStyleMetrics(context, style, metricsCache)
  const strokePadding = style.strokeWidth / 2

  return {
    actualLeft: Math.max(Number(metrics.actualBoundingBoxLeft) || 0, 0),
    actualRight: Math.max(
      Number(metrics.actualBoundingBoxRight) || 0,
      Number(metrics.width) || 0,
      0,
    ),
    ascent: Math.max(
      Number(metrics.actualBoundingBoxAscent) || 0,
      fallbackMetrics.ascent,
    ),
    descent: Math.max(
      Number(metrics.actualBoundingBoxDescent) || 0,
      fallbackMetrics.descent,
    ),
    strokePadding,
  }
}

function shouldMergeCharactersIntoSameRun(currentRun, nextCharacter) {
  if (!currentRun || !nextCharacter) {
    return false
  }

  if (getRunStyleKey(nextCharacter.style) !== getRunStyleKey(currentRun.style)) {
    return false
  }

  const currentIsWhitespace = /\s/.test(currentRun.characters.at(-1)?.char ?? '')
  const nextIsWhitespace = /\s/.test(nextCharacter.char)

  if (currentIsWhitespace === nextIsWhitespace) {
    return true
  }

  return containsArabicOrRequiresComplexShaping(currentRun.text + nextCharacter.char)
}

function createRunsFromCharacters(characters, context, metricsCache = null) {
  if (!characters.length) {
    return []
  }

  const runs = []

  function finalizeRun(run) {
    const advanceWidth = measureRunAdvanceWidth(context, run.text, run.style)
    const runMetrics = getRunMetrics(context, run.text, run.style, metricsCache)

    return {
      ...run,
      containsComplexShaping: containsArabicOrRequiresComplexShaping(run.text),
      width: advanceWidth,
      advanceWidth,
      ...runMetrics,
    }
  }

  let currentRun = {
    style: characters[0].style,
    text: characters[0].char,
    characters: [characters[0]],
  }

  for (const character of characters.slice(1)) {
    if (shouldMergeCharactersIntoSameRun(currentRun, character)) {
      currentRun.text += character.char
      currentRun.characters.push(character)
      continue
    }

    runs.push(finalizeRun(currentRun))
    currentRun = {
      style: character.style,
      text: character.char,
      characters: [character],
    }
  }

  runs.push(finalizeRun(currentRun))

  return runs
}

function createPositionedCharacters(characters, direction, totalWidth = null) {
  if (!characters.length) {
    return []
  }

  if (direction === 'rtl') {
    const positionedCharactersByStartIndex = new Map()
    let currentX = totalWidth ?? getCharacterSequenceWidth(characters)
    const visualCharacters = [...characters].reverse()

    for (const [index, character] of visualCharacters.entries()) {
      const advanceWidth = getCharacterAdvanceWidth(character, index, visualCharacters)
      const xStart = currentX - advanceWidth
      const xEnd = currentX

      positionedCharactersByStartIndex.set(character.startIndex, {
        character,
        xStart,
        xEnd,
      })

      currentX = xStart
    }

    return characters.map((character) => (
      positionedCharactersByStartIndex.get(character.startIndex)
    ))
  }

  let currentX = 0

  return characters.map((character, index) => {
    const advanceWidth = getCharacterAdvanceWidth(character, index, characters)
    const positionedCharacter = {
      character,
      xStart: currentX,
      xEnd: currentX + advanceWidth,
    }

    currentX = positionedCharacter.xEnd

    return positionedCharacter
  })
}

function createPositionedRuns(logicalRuns, direction, totalWidth) {
  if (logicalRuns.length === 0) {
    return []
  }

  if (direction === 'rtl') {
    let currentX = totalWidth

    return [...logicalRuns].reverse().map((run) => {
      const positionedRun = {
        ...run,
        direction: resolveDetectedTextDirection(run.text, direction),
        drawX: currentX,
      }

      currentX -= run.advanceWidth

      return positionedRun
    })
  }

  let currentX = 0

  return logicalRuns.map((run) => {
    const positionedRun = {
      ...run,
      direction: resolveDetectedTextDirection(run.text, direction),
      drawX: currentX,
    }

    currentX += run.advanceWidth

    return positionedRun
  })
}

function finalizeLayoutLine(characters, fallbackStyle, context, metricsCache, fallbackDirection = 'ltr') {
  const lineCharacters = Array.isArray(characters) ? characters : []
  const direction = resolveDetectedTextDirection(
    lineCharacters.map((character) => character.char).join(''),
    fallbackDirection,
  )
  const logicalRuns = createRunsFromCharacters(lineCharacters, context, metricsCache)
  const lineWidth = logicalRuns.reduce((totalWidth, run) => totalWidth + run.advanceWidth, 0)
  const fallbackMetrics = getTextStyleMetrics(context, fallbackStyle, metricsCache)
  const lineMetrics = lineCharacters.reduce((largestMetrics, character) => {
    return {
      ascent: Math.max(
        largestMetrics.ascent,
        character.ascent + character.strokePadding + TEXT_GLYPH_EDGE_BUFFER,
      ),
      descent: Math.max(
        largestMetrics.descent,
        character.descent + character.strokePadding + TEXT_GLYPH_EDGE_BUFFER,
      ),
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
  const positionedCharacters = createPositionedCharacters(lineCharacters, direction, lineWidth)
  const positionedRuns = createPositionedRuns(logicalRuns, direction, lineWidth)
  const lineBounds = positionedRuns.reduce((bounds, run) => {
    if (!run) {
      return bounds
    }

    const xAnchor = run.drawX
    const left = direction === 'rtl'
      ? xAnchor - run.actualRight - run.strokePadding
      : xAnchor - run.actualLeft - run.strokePadding
    const right = direction === 'rtl'
      ? xAnchor + run.actualLeft + run.strokePadding
      : xAnchor + run.actualRight + run.strokePadding

    return {
      minX: Math.min(bounds.minX, left),
      maxX: Math.max(bounds.maxX, right),
    }
  }, {
    minX: 0,
    maxX: 0,
  })

  return {
    text: lineCharacters.map((character) => character.char).join(''),
    characters: lineCharacters,
    positionedCharacters,
    runs: positionedRuns,
    direction,
    width: lineWidth,
    lineHeight,
    ascent: lineMetrics.ascent,
    descent: lineMetrics.descent,
    baselineOffset,
    visualLeft: lineBounds.minX,
    visualRight: lineBounds.maxX,
  }
}

function trimTrailingWhitespaceCharacters(characters) {
  const lineCharacters = Array.isArray(characters) ? [...characters] : []

  while (lineCharacters.length > 0 && /\s/.test(lineCharacters.at(-1)?.char ?? '')) {
    lineCharacters.pop()
  }

  return lineCharacters
}

function layoutParagraphTokens(tokens, maxWidth, fallbackStyle, context, metricsCache, fallbackDirection = 'ltr') {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    const paragraphCharacters = tokens.flatMap((token) => token.characters)
    const paragraphDirection = resolveDetectedTextDirection(
      paragraphCharacters.map((character) => character.char).join(''),
      fallbackDirection,
    )
    return [finalizeLayoutLine(paragraphCharacters, fallbackStyle, context, metricsCache, paragraphDirection)]
  }

  if (tokens.length === 0) {
    return [finalizeLayoutLine([], fallbackStyle, context, metricsCache, fallbackDirection)]
  }

  const lines = []
  let currentCharacters = []

  function pushCurrentLine(trimTrailingWhitespace = false) {
    lines.push(finalizeLayoutLine(
      trimTrailingWhitespace
        ? trimTrailingWhitespaceCharacters(currentCharacters)
        : currentCharacters,
      fallbackStyle,
      context,
      metricsCache,
      resolveDetectedTextDirection(
        currentCharacters.map((character) => character.char).join(''),
        fallbackDirection,
      ),
    ))
    currentCharacters = []
  }

  for (const token of tokens) {
    if (token.type === 'space' && currentCharacters.length === 0) {
      continue
    }

    const nextCharacters = [...currentCharacters, ...token.characters]
    const nextWidth = measureCharacterSequenceWidth(context, nextCharacters)

    if (token.type === 'word' && currentCharacters.length > 0 && nextWidth > maxWidth) {
      pushCurrentLine(true)
    }

    if (token.width > maxWidth) {
      if (currentCharacters.length > 0) {
        pushCurrentLine(true)
      }

      currentCharacters = [...token.characters]
      pushCurrentLine()
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
  const baseDirection = detectTextDirection(layer?.text ?? '')
  const allCharacters = createStyledCharacters(layer, context, metricsCache)
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
      layoutParagraphTokens(
        tokenizeParagraphCharacters(paragraph, context),
        maxWidth,
        fallbackStyle,
        context,
        metricsCache,
        baseDirection,
      )
    ))
    : paragraphs.map((paragraph) => finalizeLayoutLine(
      paragraph,
      fallbackStyle,
      context,
      metricsCache,
      resolveDetectedTextDirection(paragraph.map((character) => character.char).join(''), baseDirection),
    ))
  const measuredLineWidth = lines.reduce((largestWidth, line) => Math.max(largestWidth, line.width), 0)
  const visualOverflowLeft = lines.reduce((largestOverflow, line) => (
    Math.max(largestOverflow, Math.max(0, -(line.visualLeft ?? 0)))
  ), 0)
  const visualOverflowRight = lines.reduce((largestOverflow, line) => (
    Math.max(largestOverflow, Math.max(0, (line.visualRight ?? line.width) - line.width))
  ), 0)
  const measuredContentWidth = mode === 'box'
    ? Math.max(maxWidth ?? 0, measuredLineWidth, 1)
    : measuredLineWidth
  const measuredHeight = lines.reduce((totalHeight, line) => totalHeight + line.lineHeight, 0)
  const paddingLeft = Math.ceil(
    (mode === 'point' ? POINT_TEXT_HORIZONTAL_PADDING_LEFT : 0) + visualOverflowLeft,
  )
  const paddingRight = Math.ceil(
    (mode === 'point' ? POINT_TEXT_HORIZONTAL_PADDING_RIGHT : 0) + visualOverflowRight,
  )
  const measuredWidth = Math.ceil(measuredContentWidth + visualOverflowLeft + visualOverflowRight)

  return {
    requiredWidth: measuredContentWidth + visualOverflowLeft + visualOverflowRight + (
      mode === 'point'
        ? POINT_TEXT_HORIZONTAL_PADDING_LEFT + POINT_TEXT_HORIZONTAL_PADDING_RIGHT
        : 0
    ),
    requiredHeight: measuredHeight + TEXT_VERTICAL_PADDING_TOP + TEXT_VERTICAL_PADDING_BOTTOM,
    width: Math.max(measuredWidth + (
      mode === 'point'
        ? POINT_TEXT_HORIZONTAL_PADDING_LEFT + POINT_TEXT_HORIZONTAL_PADDING_RIGHT
        : 0
    ), 1),
    height: Math.ceil(measuredHeight + TEXT_VERTICAL_PADDING_TOP + TEXT_VERTICAL_PADDING_BOTTOM),
    contentWidth: measuredContentWidth,
    contentHeight: measuredHeight,
    paddingLeft,
    paddingRight,
    paddingTop: TEXT_VERTICAL_PADDING_TOP,
    paddingBottom: TEXT_VERTICAL_PADDING_BOTTOM,
    lines: lines.map((line) => line.text),
    layoutLines: lines,
  }
}

function drawStyledRun(context, run, x, y) {
  context.font = getTextFontFromStyle(run.style)
  context.fillStyle = run.style.color
  context.direction = run.direction ?? 'ltr'
  context.textAlign = (run.direction ?? 'ltr') === 'rtl' ? 'right' : 'left'

  if (run.style.strokeWidth > 0 && run.style.strokeColor) {
    context.lineWidth = run.style.strokeWidth
    context.strokeStyle = run.style.strokeColor
  }

  if (run.style.letterSpacing === 0 || run.containsComplexShaping) {
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
    glyphX += (run.direction ?? 'ltr') === 'rtl'
      ? -(context.measureText(glyph).width + run.style.letterSpacing)
      : context.measureText(glyph).width + run.style.letterSpacing
  }
}

export function measureTextLayer(layer) {
  const layout = createTextLayout(layer)
  const resolvedStyle = getResolvedTextStyle(layer)

  return {
    requiredWidth: layout.requiredWidth,
    requiredHeight: layout.requiredHeight,
    width: layout.width,
    height: layout.height,
    contentWidth: layout.contentWidth,
    contentHeight: layout.contentHeight,
    paddingLeft: layout.paddingLeft,
    paddingRight: layout.paddingRight,
    paddingTop: layout.paddingTop,
    paddingBottom: layout.paddingBottom,
    lines: layout.lines,
    lineHeight: layout.layoutLines[0]?.lineHeight ?? (
      resolvedStyle.fontSize * resolvedStyle.lineHeight
    ),
    layoutLines: layout.layoutLines,
  }
}

export function getTextEditorOverlayGeometry(layer, selectionStart, selectionEnd) {
  const measurement = measureTextLayer(layer)
  const textAlign = layer.textAlign ?? DEFAULT_TEXT_ALIGN
  const availableWidth = Math.max(
    (layer.width ?? measurement.width) - measurement.paddingLeft - measurement.paddingRight,
    0,
  )
  const normalizedStart = Math.max(0, Math.floor(Number(selectionStart) || 0))
  const normalizedEnd = Math.max(0, Math.floor(Number(selectionEnd) || 0))
  const selectionRects = []
  let caretRect = null
  let currentY = measurement.paddingTop

  function getLineDrawX(line) {
    const alignedOffset = textAlign === 'center'
      ? (availableWidth - line.width) / 2
      : textAlign === 'right'
        ? availableWidth - line.width
        : 0

    return measurement.paddingLeft + alignedOffset
  }

  for (const line of measurement.layoutLines ?? []) {
    const drawX = getLineDrawX(line)
    let lineSelectionStart = null
    let lineSelectionEnd = null

    if (line.characters.length === 0) {
      if (normalizedStart === normalizedEnd && caretRect === null) {
        caretRect = {
          x: drawX + (line.direction === 'rtl' ? line.width : 0),
          y: currentY,
          height: line.lineHeight,
        }
      }

      currentY += line.lineHeight
      continue
    }

    for (const positionedCharacter of line.positionedCharacters ?? []) {
      if (!positionedCharacter) {
        continue
      }

      const { character, xStart, xEnd } = positionedCharacter
      const charStartX = drawX + xStart
      const charEndX = drawX + xEnd

      if (normalizedStart >= character.startIndex && normalizedStart <= character.endIndex) {
        caretRect = normalizedStart === normalizedEnd
          ? {
            x: line.direction === 'rtl'
              ? (normalizedStart === character.endIndex ? charStartX : charEndX)
              : (normalizedStart === character.endIndex ? charEndX : charStartX),
            y: currentY,
            height: line.lineHeight,
          }
          : caretRect
      }

      const overlapsSelection = normalizedEnd > character.startIndex && normalizedStart < character.endIndex

      if (overlapsSelection) {
        lineSelectionStart = lineSelectionStart === null
          ? Math.min(charStartX, charEndX)
          : Math.min(lineSelectionStart, charStartX, charEndX)
        lineSelectionEnd = lineSelectionEnd === null
          ? Math.max(charStartX, charEndX)
          : Math.max(lineSelectionEnd, charStartX, charEndX)
      }
    }

    const lastPositionedCharacter = line.positionedCharacters?.at(-1)
    const lastCharacter = lastPositionedCharacter?.character

    if (
      normalizedStart === normalizedEnd &&
      caretRect === null &&
      lastCharacter &&
      normalizedStart >= lastCharacter.endIndex
    ) {
      caretRect = {
        x: line.direction === 'rtl'
          ? drawX + (lastPositionedCharacter?.xStart ?? 0)
          : drawX + (lastPositionedCharacter?.xEnd ?? line.width),
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
        x: lastLine.direction === 'rtl'
          ? getLineDrawX(lastLine) + (lastLine.positionedCharacters?.at(-1)?.xStart ?? 0)
          : getLineDrawX(lastLine) + (lastLine.positionedCharacters?.at(-1)?.xEnd ?? lastLine.width),
        y: currentY - lastLine.lineHeight,
        height: lastLine.lineHeight,
      }
    }
  }

  return {
    selectionRects,
    caretRect,
    paddingLeft: measurement.paddingLeft,
    paddingRight: measurement.paddingRight,
    paddingTop: measurement.paddingTop,
    paddingBottom: measurement.paddingBottom,
  }
}

function getPointTextAnchorX(layer) {
  const textAlign = layer.textAlign ?? DEFAULT_TEXT_ALIGN

  if (textAlign === 'left') {
    return (layer.x ?? 0) - POINT_TEXT_HORIZONTAL_PADDING_LEFT
  }

  const layerTopLeft = centerToTopLeft(layer.x, layer.y, layer.width, layer.height)
  const contentWidth = Math.max(
    (layer.width ?? 0) - POINT_TEXT_HORIZONTAL_PADDING_LEFT - POINT_TEXT_HORIZONTAL_PADDING_RIGHT,
    0,
  )

  if (textAlign === 'center') {
    return layerTopLeft.x + (contentWidth / 2)
  }

  if (textAlign === 'right') {
    return layerTopLeft.x + contentWidth
  }

  return layerTopLeft.x
}

function getPointTextXFromAnchor(anchorX, width, textAlign) {
  const contentWidth = Math.max(
    (width ?? 0) - POINT_TEXT_HORIZONTAL_PADDING_LEFT - POINT_TEXT_HORIZONTAL_PADDING_RIGHT,
    0,
  )

  if (textAlign === 'center') {
    return anchorX - (contentWidth / 2)
  }

  if (textAlign === 'right') {
    return anchorX - contentWidth
  }

  return anchorX
}

function getPointTextVisualAnchorX(layer) {
  const measurement = measureTextLayer(layer)
  const topLeft = centerToTopLeft(layer.x, layer.y, layer.width, layer.height)
  const textAlign = layer.textAlign ?? DEFAULT_TEXT_ALIGN
  const contentLeft = topLeft.x + measurement.paddingLeft
  const contentRight = topLeft.x + layer.width - measurement.paddingRight

  if (textAlign === 'center') {
    return contentLeft + ((contentRight - contentLeft) / 2)
  }

  if (textAlign === 'right') {
    return contentRight
  }

  return contentLeft
}

function applyPointTextVisualAnchor(previousLayer, nextLayer) {
  if (!previousLayer || previousLayer.mode !== 'point' || nextLayer.mode !== 'point') {
    return nextLayer
  }

  const previousVisualAnchorX = getPointTextVisualAnchorX(previousLayer)
  const nextMeasurement = measureTextLayer(nextLayer)
  const nextTopLeft = centerToTopLeft(nextLayer.x, nextLayer.y, nextLayer.width, nextLayer.height)
  const nextTextAlign = nextLayer.textAlign ?? DEFAULT_TEXT_ALIGN
  const nextContentWidth = Math.max(
    nextLayer.width - nextMeasurement.paddingLeft - nextMeasurement.paddingRight,
    0,
  )
  const nextContentLeft = nextTextAlign === 'center'
    ? previousVisualAnchorX - (nextContentWidth / 2)
    : nextTextAlign === 'right'
      ? previousVisualAnchorX - nextContentWidth
      : previousVisualAnchorX

  return {
    ...nextLayer,
    ...topLeftToCenter(
      nextContentLeft - nextMeasurement.paddingLeft,
      nextTopLeft.y,
      nextLayer.width,
      nextLayer.height,
    ),
  }
}

function preservePointTextAnchor(previousLayer, nextLayer) {
  if (!previousLayer || previousLayer.mode !== 'point' || nextLayer.mode !== 'point') {
    return nextLayer
  }

  const anchorX = getPointTextAnchorX(previousLayer)

  return {
    ...nextLayer,
    ...topLeftToCenter(
      getPointTextXFromAnchor(anchorX, nextLayer.width, nextLayer.textAlign ?? DEFAULT_TEXT_ALIGN),
      centerToTopLeft(nextLayer.x, nextLayer.y, nextLayer.width, nextLayer.height).y,
      nextLayer.width,
      nextLayer.height,
    ),
  }
}

export function syncTextLayerLayout(layer, previousLayer = null) {
  const preserveExactJsonBoxSize = layer.mode === 'box' && layer.preserveExactJsonBoxSize === true
  const normalizedStyleRanges = normalizeTextStyleRanges(
    layer.styleRanges,
    String(layer.text ?? '').length,
  )
  let measurement = measureTextLayer({
    ...layer,
    styleRanges: normalizedStyleRanges,
  })
  const requestedBoxWidth = Math.max(Number(layer.boxWidth ?? layer.width ?? measurement.width) || 0, 1)
  const requestedBoxHeight = Math.max(Number(layer.boxHeight ?? layer.height ?? measurement.height) || 0, 1)
  let normalizedBoxWidth = null
  let normalizedBoxHeight = null
  let nextFontSize = Math.max(MIN_AUTO_FIT_FONT_SIZE, Number(layer.fontSize) || MIN_AUTO_FIT_FONT_SIZE)
  let nextStyleRanges = normalizedStyleRanges

  if (layer.mode === 'box') {
    let workingLayer = {
      ...layer,
      styleRanges: normalizedStyleRanges,
      boxWidth: requestedBoxWidth,
      boxHeight: requestedBoxHeight,
      width: requestedBoxWidth,
      height: requestedBoxHeight,
    }

    if (isBoxTextAutoFitEnabled(workingLayer)) {
      const autoFitResult = resolveAutoFitFontSize(
        workingLayer,
        requestedBoxWidth,
        requestedBoxHeight,
      )

      measurement = autoFitResult.measurement
      normalizedBoxWidth = requestedBoxWidth
      normalizedBoxHeight = requestedBoxHeight
      nextFontSize = autoFitResult.layer.fontSize
      nextStyleRanges = autoFitResult.layer.styleRanges
    } else {
      for (let iteration = 0; iteration < 3; iteration += 1) {
        measurement = measureTextLayer(workingLayer)
        normalizedBoxWidth = preserveExactJsonBoxSize
          ? Math.max(requestedBoxWidth, measurement.width, 1)
          : Math.max(requestedBoxWidth, measurement.width, 1)
        normalizedBoxHeight = preserveExactJsonBoxSize
          ? Math.max(requestedBoxHeight, measurement.height, 1)
          : Math.max(requestedBoxHeight, measurement.height, 1)

        if (
          normalizedBoxWidth === (workingLayer.boxWidth ?? workingLayer.width) &&
          normalizedBoxHeight === (workingLayer.boxHeight ?? workingLayer.height)
        ) {
          break
        }

        workingLayer = {
          ...workingLayer,
          boxWidth: normalizedBoxWidth,
          boxHeight: normalizedBoxHeight,
          width: normalizedBoxWidth,
          height: normalizedBoxHeight,
        }
      }
    }
  }

  const nextLayer = {
    ...layer,
    fontSize: nextFontSize,
    boxWidth: normalizedBoxWidth,
    boxHeight: normalizedBoxHeight,
    measuredWidth: layer.mode === 'box' ? measurement.requiredWidth : measurement.width,
    measuredHeight: layer.mode === 'box' ? measurement.requiredHeight : measurement.height,
    width: layer.mode === 'box' ? normalizedBoxWidth : measurement.width,
    height: layer.mode === 'box' ? normalizedBoxHeight : measurement.height,
    styleRanges: nextStyleRanges,
  }

  return preservePointTextAnchor(previousLayer, nextLayer)
}

export function updateTextContent(layer, text) {
  const nextLayer = syncTextLayerLayout({
    ...layer,
    text,
    name: String(text ?? '').replace(/\s+/g, ' ').trim() || 'New Text',
    styleRanges: remapTextStyleRangesForTextChange(layer.text, text, layer.styleRanges),
  }, layer)

  return applyPointTextVisualAnchor(layer, nextLayer)
}

export function updateTextStyle(layer, updates) {
  const disablesAutoFit = (
    layer?.mode === 'box' &&
    layer?.autoFit === true &&
    updates &&
    typeof updates === 'object' &&
    Object.prototype.hasOwnProperty.call(updates, 'fontSize') &&
    !Object.prototype.hasOwnProperty.call(updates, 'autoFit')
  )

  return syncTextLayerLayout({
    ...layer,
    ...(disablesAutoFit ? { autoFit: false } : {}),
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
    autoFit: true,
    mode: 'box',
    boxWidth: Math.max(newBoxWidth, 1),
    boxHeight: newBoxHeight,
  }, layer)
}

export function getTextBounds(layer) {
  const topLeft = centerToTopLeft(layer.x, layer.y, layer.width, layer.height)

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: layer.width,
    height: layer.height,
  }
}

export function renderTextLayer(context, layer) {
  const measurement = measureTextLayer(layer)
  const textAlign = layer.textAlign ?? DEFAULT_TEXT_ALIGN
  const availableWidth = Math.max(
    (layer.width ?? measurement.width) - measurement.paddingLeft - measurement.paddingRight,
    0,
  )

  context.save()
  context.clearRect(0, 0, layer.width, layer.height)
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  context.direction = 'ltr'

  let currentY = measurement.paddingTop

  for (const line of measurement.layoutLines ?? []) {
    const drawX = measurement.paddingLeft + (
      textAlign === 'center'
        ? (availableWidth - line.width) / 2
        : textAlign === 'right'
          ? availableWidth - line.width
          : 0
    )
    const baselineY = currentY + line.baselineOffset

    for (const run of line.runs) {
      drawStyledRun(context, run, drawX + run.drawX, baselineY)
    }

    currentY += line.lineHeight
  }

  context.restore()
}
