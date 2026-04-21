import { useCallback, useEffect, useRef } from 'react'

export const DEFAULT_PRESS_AND_HOLD_DELAY_MS = 320
export const DEFAULT_PRESS_AND_HOLD_INTERVAL_MS = 70

export function usePressAndHoldRepeat({
  onStep,
  onStop,
  delayMs = DEFAULT_PRESS_AND_HOLD_DELAY_MS,
  intervalMs = DEFAULT_PRESS_AND_HOLD_INTERVAL_MS,
  disabled = false,
}) {
  const timeoutRef = useRef(null)
  const intervalRef = useRef(null)
  const isPressingRef = useRef(false)
  const suppressClickRef = useRef(false)

  const clearScheduledRepeat = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const stopRepeating = useCallback(() => {
    const wasPressing = isPressingRef.current

    clearScheduledRepeat()
    isPressingRef.current = false

    if (wasPressing) {
      onStop?.()
    }
  }, [clearScheduledRepeat, onStop])

  useEffect(() => () => {
    stopRepeating()
  }, [stopRepeating])

  const handlePointerDown = useCallback((event) => {
    if (
      disabled ||
      event.button !== 0 ||
      (event.pointerType !== 'mouse' && event.isPrimary === false)
    ) {
      return
    }

    suppressClickRef.current = true
    isPressingRef.current = true
    onStep()

    clearScheduledRepeat()

    timeoutRef.current = window.setTimeout(() => {
      onStep()
      intervalRef.current = window.setInterval(() => {
        onStep()
      }, intervalMs)
      timeoutRef.current = null
    }, delayMs)
  }, [clearScheduledRepeat, delayMs, disabled, intervalMs, onStep])

  const handleClick = useCallback((event) => {
    if (disabled) {
      return
    }

    if (suppressClickRef.current) {
      event.preventDefault()
      suppressClickRef.current = false
      return
    }

    onStep()
  }, [disabled, onStep])

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: stopRepeating,
    onPointerLeave: stopRepeating,
    onPointerCancel: stopRepeating,
    onClick: handleClick,
  }
}
