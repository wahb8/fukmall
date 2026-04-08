import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useHistory } from './useHistory'

describe('useHistory', () => {
  it('supports transient updates without creating history entries', () => {
    const { result } = renderHook(() => useHistory({ value: 1 }))

    act(() => {
      result.current.setTransient({ value: 2 })
    })

    expect(result.current.present).toEqual({ value: 2 })
    expect(result.current.history.past).toEqual([])
    expect(result.current.canUndo).toBe(false)
  })

  it('commits a transient interaction as a single undoable step', () => {
    const { result } = renderHook(() => useHistory({ value: 1 }))
    const previousState = result.current.present

    act(() => {
      result.current.setTransient({ value: 2 })
    })

    act(() => {
      result.current.commitTransientChange(previousState)
    })

    expect(result.current.history.past).toEqual([{ value: 1 }])
    expect(result.current.present).toEqual({ value: 2 })
    expect(result.current.canUndo).toBe(true)
  })

  it('resets the full history stack', () => {
    const { result } = renderHook(() => useHistory({ value: 1 }))

    act(() => {
      result.current.commit({ value: 2 })
    })

    act(() => {
      result.current.reset({ value: 99 })
    })

    expect(result.current.history).toEqual({
      past: [],
      present: { value: 99 },
      future: [],
    })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})
