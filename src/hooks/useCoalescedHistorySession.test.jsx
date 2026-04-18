import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCoalescedHistorySession } from './useCoalescedHistorySession'

describe('useCoalescedHistorySession', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces repeated updates under the same key into one history commit', () => {
    const commitTransientChange = vi.fn()
    const applyUpdate = vi.fn()
    const { result } = renderHook(() => useCoalescedHistorySession({ commitTransientChange }))

    act(() => {
      result.current.applyCoalescedUpdate({
        key: 'fontSize',
        previousState: { size: 12 },
        startValue: 12,
        nextValue: 18,
        applyUpdate,
        useInactivityTimeout: false,
      })
      result.current.applyCoalescedUpdate({
        key: 'fontSize',
        previousState: { size: 12 },
        startValue: 12,
        nextValue: 24,
        applyUpdate,
        useInactivityTimeout: false,
      })
    })

    expect(applyUpdate).toHaveBeenCalledTimes(2)
    expect(result.current.hasActiveSession()).toBe(true)

    act(() => {
      expect(result.current.finishSession()).toBe(true)
    })

    expect(commitTransientChange).toHaveBeenCalledTimes(1)
    expect(commitTransientChange).toHaveBeenCalledWith({ size: 12 })
    expect(result.current.hasActiveSession()).toBe(false)
  })

  it('finishes the session automatically after inactivity', () => {
    vi.useFakeTimers()
    const commitTransientChange = vi.fn()
    const applyUpdate = vi.fn()
    const { result } = renderHook(() => useCoalescedHistorySession({
      commitTransientChange,
      inactivityTimeoutMs: 200,
    }))

    act(() => {
      result.current.applyCoalescedUpdate({
        key: 'x',
        previousState: { x: 10 },
        startValue: 10,
        nextValue: 25,
        applyUpdate,
      })
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(commitTransientChange).toHaveBeenCalledWith({ x: 10 })
    expect(result.current.hasActiveSession()).toBe(false)
  })

  it('discards the session without committing when requested', () => {
    const commitTransientChange = vi.fn()
    const { result } = renderHook(() => useCoalescedHistorySession({ commitTransientChange }))

    act(() => {
      result.current.applyCoalescedUpdate({
        key: 'opacity',
        previousState: { opacity: 1 },
        startValue: 1,
        nextValue: 0.5,
        applyUpdate: vi.fn(),
        useInactivityTimeout: false,
      })
    })

    act(() => {
      result.current.discardSession()
    })

    expect(commitTransientChange).not.toHaveBeenCalled()
    expect(result.current.hasActiveSession()).toBe(false)
  })

  it('switches keys by finishing the previous session first', () => {
    const commitTransientChange = vi.fn()
    const { result } = renderHook(() => useCoalescedHistorySession({ commitTransientChange }))

    act(() => {
      result.current.applyCoalescedUpdate({
        key: 'width',
        previousState: { width: 120 },
        startValue: 120,
        nextValue: 200,
        applyUpdate: vi.fn(),
        useInactivityTimeout: false,
      })
      result.current.applyCoalescedUpdate({
        key: 'height',
        previousState: { height: 90 },
        startValue: 90,
        nextValue: 140,
        applyUpdate: vi.fn(),
        useInactivityTimeout: false,
      })
    })

    expect(commitTransientChange).toHaveBeenCalledTimes(1)
    expect(commitTransientChange).toHaveBeenCalledWith({ width: 120 })
    expect(result.current.hasActiveSession()).toBe(true)
  })
})
