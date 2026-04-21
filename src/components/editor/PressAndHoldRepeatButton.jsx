import { usePressAndHoldRepeat } from '../../hooks/usePressAndHoldRepeat'

export function PressAndHoldRepeatButton({
  onStep,
  onStop,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onClick,
  delayMs,
  intervalMs,
  disabled = false,
  className,
  children,
  ...rest
}) {
  const repeatHandlers = usePressAndHoldRepeat({
    onStep,
    onStop,
    delayMs,
    intervalMs,
    disabled,
  })

  return (
    <button
      {...rest}
      className={className}
      type="button"
      disabled={disabled}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        repeatHandlers.onPointerDown(event)
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        repeatHandlers.onPointerUp(event)
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event)
        repeatHandlers.onPointerLeave(event)
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        repeatHandlers.onPointerCancel(event)
      }}
      onClick={(event) => {
        onClick?.(event)
        repeatHandlers.onClick(event)
      }}
    >
      {children}
    </button>
  )
}
