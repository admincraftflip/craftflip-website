const AUTH_ERROR_MESSAGES = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/missing-password': 'Please enter your password.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/password-does-not-meet-requirements': 'Password does not meet the requirements.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/popup-blocked': 'The sign-in popup was blocked. Allow popups for this site and try again.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email. Sign in with the method you used originally.',
  'auth/unauthorized-domain': 'Sign-in is not enabled for this domain.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
}

// Closing the popup is a user choice, not an error worth a toast.
const SILENT_ERRORS = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])

export function isSilentAuthError(error) {
  return SILENT_ERRORS.has(error?.code)
}

export function getAuthErrorMessage(error) {
  return AUTH_ERROR_MESSAGES[error?.code] ?? 'Something went wrong. Please try again.'
}
