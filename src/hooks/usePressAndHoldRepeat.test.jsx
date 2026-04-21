import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PressAndHoldRepeatButton } from '../components/editor/PressAndHoldRepeatButton'

describe('usePressAndHoldRepeat', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('increments once on press, repeats after the delay, and stops on release', () => {
    vi.useFakeTimers()
    const onStep = vi.fn()
    const onStop = vi.fn()

    render(
      <PressAndHoldRepeatButton onStep={onStep} onStop={onStop}>
        +
      </PressAndHoldRepeatButton>,
    )

    const button = screen.getByRole('button', { name: '+' })

    fireEvent.pointerDown(button, { button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true })

    expect(onStep).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(319)
    expect(onStep).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(onStep).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(140)
    expect(onStep).toHaveBeenCalledTimes(4)

    fireEvent.pointerUp(button, { button: 0, buttons: 0, pointerType: 'mouse', isPrimary: true })
    expect(onStop).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(300)
    expect(onStep).toHaveBeenCalledTimes(4)
  })

  it('supports click-based single step activation and cleans up on unmount', () => {
    vi.useFakeTimers()
    const onStep = vi.fn()
    const onStop = vi.fn()

    const { unmount } = render(
      <PressAndHoldRepeatButton onStep={onStep} onStop={onStop}>
        -
      </PressAndHoldRepeatButton>,
    )

    fireEvent.click(screen.getByRole('button', { name: '-' }))
    expect(onStep).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(screen.getByRole('button', { name: '-' }), {
      button: 0,
      buttons: 1,
      pointerType: 'mouse',
      isPrimary: true,
    })
    expect(onStep).toHaveBeenCalledTimes(2)

    unmount()
    expect(onStop).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(500)
    expect(onStep).toHaveBeenCalledTimes(2)
  })
})
