function drawRoundStroke(ctx, fromX, fromY, toX, toY, size, compositeOperation) {
  ctx.save()
  ctx.globalCompositeOperation = compositeOperation
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()
  ctx.restore()
}

function drawRoundDot(ctx, x, y, size, compositeOperation) {
  ctx.save()
  ctx.globalCompositeOperation = compositeOperation
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function eraseStroke(ctx, fromX, fromY, toX, toY, size) {
  drawRoundStroke(ctx, fromX, fromY, toX, toY, size, 'destination-out')
}

export function eraseDot(ctx, x, y, size) {
  drawRoundDot(ctx, x, y, size, 'destination-out')
}

export function paintMaskStroke(ctx, fromX, fromY, toX, toY, size) {
  drawRoundStroke(ctx, fromX, fromY, toX, toY, size, 'source-over')
}

export function paintMaskDot(ctx, x, y, size) {
  drawRoundDot(ctx, x, y, size, 'source-over')
}
