/**
 * @template T
 * @typedef {Object} HistoryState
 * @property {T[]} past
 * @property {T} present
 * @property {T[]} future
 */

/**
 * @template T
 * @param {T} initialState
 * @returns {HistoryState<T>}
 */
export function createHistory(initialState) {
  return {
    past: [],
    present: initialState,
    future: [],
  }
}

/**
 * @template T
 * @param {HistoryState<T>} history
 * @param {T} newState
 * @returns {HistoryState<T>}
 */
export function applyChange(history, newState) {
  if (Object.is(history.present, newState)) {
    return history
  }

  return {
    past: [...history.past, history.present],
    present: newState,
    future: [],
  }
}

/**
 * @template T
 * @param {HistoryState<T>} history
 * @returns {HistoryState<T>}
 */
export function undo(history) {
  if (history.past.length === 0) {
    return history
  }

  const previousState = history.past.at(-1)

  return {
    past: history.past.slice(0, -1),
    present: previousState,
    future: [history.present, ...history.future],
  }
}

/**
 * @template T
 * @param {HistoryState<T>} history
 * @returns {HistoryState<T>}
 */
export function redo(history) {
  if (history.future.length === 0) {
    return history
  }

  const nextState = history.future[0]

  return {
    past: [...history.past, history.present],
    present: nextState,
    future: history.future.slice(1),
  }
}

/**
 * @template T
 * @param {HistoryState<T>} history
 * @returns {boolean}
 */
export function canUndo(history) {
  return history.past.length > 0
}

/**
 * @template T
 * @param {HistoryState<T>} history
 * @returns {boolean}
 */
export function canRedo(history) {
  return history.future.length > 0
}
