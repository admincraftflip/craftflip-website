import { useState } from 'react'
import toast from 'react-hot-toast'
import { getAuthErrorMessage, isSilentAuthError } from '../utils/authErrors'

// Runs one auth action at a time, tracks which one is pending, and toasts friendly errors.
export function useAuthAction() {
  const [pendingAction, setPendingAction] = useState(null)

  async function runAuthAction(action, task) {
    setPendingAction(action)
    try {
      await task()
    } catch (error) {
      if (!isSilentAuthError(error)) toast.error(getAuthErrorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  return { pendingAction, busy: pendingAction !== null, runAuthAction }
}
