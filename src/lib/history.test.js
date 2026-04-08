import { describe, expect, it } from 'vitest'
import { applyChange, canRedo, canUndo, createHistory, redo, undo } from './history'

describe('history helpers', () => {
  it('creates an initial history state', () => {
    const state = { value: 1 }
    expect(createHistory(state)).toEqual({
      past: [],
      present: state,
      future: [],
    })
  })

  it('pushes committed changes into past', () => {
    const state = createHistory({ value: 1 })
    const nextState = { value: 2 }

    expect(applyChange(state, nextState)).toEqual({
      past: [{ value: 1 }],
      present: nextState,
      future: [],
    })
  })

  it('clears redo history on a new commit', () => {
    const history = {
      past: [{ value: 1 }],
      present: { value: 2 },
      future: [{ value: 3 }],
    }

    expect(applyChange(history, { value: 4 })).toEqual({
      past: [{ value: 1 }, { value: 2 }],
      present: { value: 4 },
      future: [],
    })
  })

  it('undoes to the previous snapshot and exposes redo', () => {
    const history = {
      past: [{ value: 1 }, { value: 2 }],
      present: { value: 3 },
      future: [],
    }

    const undone = undo(history)

    expect(undone).toEqual({
      past: [{ value: 1 }],
      present: { value: 2 },
      future: [{ value: 3 }],
    })
    expect(canUndo(undone)).toBe(true)
    expect(canRedo(undone)).toBe(true)
  })

  it('redoes to the next snapshot', () => {
    const history = {
      past: [{ value: 1 }],
      present: { value: 2 },
      future: [{ value: 3 }],
    }

    expect(redo(history)).toEqual({
      past: [{ value: 1 }, { value: 2 }],
      present: { value: 3 },
      future: [],
    })
  })

  it('returns the same history object when no-op transitions are requested', () => {
    const state = createHistory({ value: 1 })

    expect(applyChange(state, state.present)).toBe(state)
    expect(undo(state)).toBe(state)
    expect(redo(state)).toBe(state)
  })
})
