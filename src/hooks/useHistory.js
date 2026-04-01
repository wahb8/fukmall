import { useState } from 'react'
import {
  applyChange,
  canRedo,
  canUndo,
  createHistory,
  redo,
  undo,
} from '../lib/history'

function resolveNextState(nextStateOrUpdater, currentState) {
  return typeof nextStateOrUpdater === 'function'
    ? nextStateOrUpdater(currentState)
    : nextStateOrUpdater
}

export function useHistory(initialState) {
  const [history, setHistory] = useState(() => createHistory(initialState))

  function commit(nextStateOrUpdater) {
    setHistory((currentHistory) => {
      const nextState = resolveNextState(nextStateOrUpdater, currentHistory.present)
      return applyChange(currentHistory, nextState)
    })
  }

  function setTransient(nextStateOrUpdater) {
    setHistory((currentHistory) => {
      const nextState = resolveNextState(nextStateOrUpdater, currentHistory.present)

      if (Object.is(nextState, currentHistory.present)) {
        return currentHistory
      }

      return {
        ...currentHistory,
        present: nextState,
      }
    })
  }

  function commitTransientChange(previousState) {
    setHistory((currentHistory) => {
      if (Object.is(previousState, currentHistory.present)) {
        return currentHistory
      }

      return {
        past: [...currentHistory.past, previousState],
        present: currentHistory.present,
        future: [],
      }
    })
  }

  function handleUndo() {
    setHistory((currentHistory) => undo(currentHistory))
  }

  function handleRedo() {
    setHistory((currentHistory) => redo(currentHistory))
  }

  function reset(nextState) {
    setHistory(createHistory(nextState))
  }

  return {
    history,
    present: history.present,
    commit,
    setTransient,
    commitTransientChange,
    undo: handleUndo,
    redo: handleRedo,
    reset,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  }
}
