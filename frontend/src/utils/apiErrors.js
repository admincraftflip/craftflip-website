// Backend errors are { success: false, message }. Network failures and non-JSON responses get a generic message.
export function getApiErrorMessage(error) {
  return error.response?.data?.message ?? 'Something went wrong. Please try again.'
}
