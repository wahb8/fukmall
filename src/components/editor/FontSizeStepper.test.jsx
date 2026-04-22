import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FontSizeStepper } from './FontSizeStepper'

describe('FontSizeStepper', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('decrements once on click and repeats increments while held until release', () => {
    vi.useFakeTimers()
    const onDecrementStep = vi.fn()
    const onIncrementStep = vi.fn()
    const onStepStop = vi.fn()

    render(
      <FontSizeStepper
        value={40}
        onDecrementStep={onDecrementStep}
        onIncrementStep={onIncrementStep}
        onStepStop={onStepStop}
        onStepperPointerDown={() => {}}
        inputPointerDown={() => {}}
        onInputFocus={() => {}}
        onInputChange={() => {}}
        onInputBlur={() => {}}
        onInputKeyDown={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }))
    expect(onDecrementStep).toHaveBeenCalledTimes(1)

    const increaseButton = screen.getByRole('button', { name: 'Increase font size' })

    fireEvent.pointerDown(increaseButton, {
      button: 0,
      buttons: 1,
      pointerType: 'mouse',
      isPrimary: true,
    })

    expect(onIncrementStep).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(320)
    expect(onIncrementStep).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(140)
    expect(onIncrementStep).toHaveBeenCalledTimes(4)

    fireEvent.pointerUp(increaseButton, {
      button: 0,
      buttons: 0,
      pointerType: 'mouse',
      isPrimary: true,
    })
    expect(onStepStop).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(280)
    expect(onIncrementStep).toHaveBeenCalledTimes(4)
  })

  it('forwards the configured max to the numeric input', () => {
    render(
      <FontSizeStepper
        value={1000}
        max={1000}
        onDecrementStep={() => {}}
        onIncrementStep={() => {}}
        onStepStop={() => {}}
        onStepperPointerDown={() => {}}
        inputPointerDown={() => {}}
        onInputFocus={() => {}}
        onInputChange={() => {}}
        onInputBlur={() => {}}
        onInputKeyDown={() => {}}
      />,
    )

    expect(screen.getByRole('spinbutton')).toHaveAttribute('max', '1000')
  })
})
