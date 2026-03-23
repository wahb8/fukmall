function applyBrushStyle(ctx, color, size) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size
  ctx.strokeStyle = color
  ctx.fillStyle = color
}

export function drawStroke(ctx, fromX, fromY, toX, toY, color, size) {
  applyBrushStyle(ctx, color, size)
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()
  ctx.restore()
}

export function drawDot(ctx, x, y, color, size) {
  applyBrushStyle(ctx, color, size)
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
