/**
 * @typedef {Object} TextObject
 * @property {string} content
 * @property {string} fontFamily
 * @property {number} fontSize
 * @property {string} color
 * @property {number} x
 * @property {number} y
 * @property {number} scaleX
 * @property {number} scaleY
 * @property {number} rotation
 */

/**
 * @param {Partial<TextObject>} overrides
 * @returns {TextObject}
 */
export function createTextObject(overrides = {}) {
  return {
    content: '',
    fontFamily: 'Arial, sans-serif',
    fontSize: 32,
    color: '#111111',
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...overrides,
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {TextObject} text
 */
export function renderText(ctx, text) {
  ctx.save()
  ctx.translate(text.x, text.y)
  ctx.rotate((text.rotation * Math.PI) / 180)
  ctx.scale(text.scaleX, text.scaleY)
  ctx.font = `${text.fontSize}px ${text.fontFamily}`
  ctx.fillStyle = text.color
  ctx.fillText(text.content, 0, 0)
  ctx.restore()
}

/**
 * @param {TextObject} text
 * @param {number} scaleX
 * @param {number} scaleY
 * @returns {TextObject}
 */
export function scaleText(text, scaleX, scaleY) {
  return {
    ...text,
    scaleX,
    scaleY,
  }
}

/**
 * @param {TextObject} text
 * @returns {TextObject}
 */
export function bakeScale(text) {
  const bakedFontSize = text.fontSize * text.scaleY
  const normalizedScaleX = text.scaleY === 0 ? text.scaleX : text.scaleX / text.scaleY

  return {
    ...text,
    fontSize: bakedFontSize,
    scaleX: normalizedScaleX,
    scaleY: 1,
  }
}
