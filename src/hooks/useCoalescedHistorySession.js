import { useCallback, useEffect, useRef } from 'react'

const DEFAULT_INACTIVITY_TIMEOUT_MS = 450

export function useCoalescedHistorySession({
  commitTransientChange,
  inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS,
}) {
  const sessionRef = useRef(null)
  const timeoutRef = useRef(null)

  const clearSessionTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const discardSession = useCallback(() => {
    clearSessionTimeout()
    sessionRef.current = null
  }, [clearSessionTimeout])

  const finishSession = useCallback(() => {
    clearSessionTimeout()

    const activeSession = sessionRef.current
    sessionRef.current = null

    if (!activeSession) {
      return false
    }

    if (Object.is(activeSession.startValue, activeSession.currentValue)) {
      return false
    }

    commitTransientChange(activeSession.previousState)
    return true
  }, [clearSessionTimeout, commitTransientChange])

  const scheduleSessionFinish = useCallback((nextTimeoutMs = inactivityTimeoutMs) => {
    clearSessionTimeout()

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      finishSession()
    }, nextTimeoutMs)
  }, [clearSessionTimeout, finishSession, inactivityTimeoutMs])

  const applyCoalescedUpdate = useCallback(({
    key,
    previousState,
    startValue,
    nextValue,
    applyUpdate,
    useInactivityTimeout = true,
    nextInactivityTimeoutMs = inactivityTimeoutMs,
  }) => {
    const activeSession = sessionRef.current

    if (!activeSession || activeSession.key !== key) {
      finishSession()
      sessionRef.current = {
        key,
        previousState,
        startValue,
        currentValue: startValue,
      }
    }

    sessionRef.current.currentValue = nextValue
    applyUpdate()

    if (useInactivityTimeout) {
      scheduleSessionFinish(nextInactivityTimeoutMs)
      return
    }

    clearSessionTimeout()
  }, [
    clearSessionTimeout,
    finishSession,
    inactivityTimeoutMs,
    scheduleSessionFinish,
  ])

  useEffect(() => discardSession, [discardSession])

  return {
    applyCoalescedUpdate,
    finishSession,
    discardSession,
    hasActiveSession: () => sessionRef.current !== null,
  }
}
