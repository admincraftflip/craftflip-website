// Polls the given processing flipbooks until stopped. A round asks for each flipbook once, and
// the next round is scheduled only after the previous one finished, so requests never pile up.
// Returns stop(); after it is called no callback runs and no request is started.
export function startConversionPolling({ ids, fetchFlipbook, onUpdate, intervalMs, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let stopped = false
  let timer = null

  async function round() {
    for (const id of ids) {
      if (stopped) return
      try {
        const flipbook = await fetchFlipbook(id)
        if (!stopped) onUpdate(id, flipbook)
      } catch {
        // A failed status check is retried on the next round.
      }
    }
    if (!stopped) timer = setTimer(round, intervalMs)
  }

  timer = setTimer(round, intervalMs)
  return () => {
    stopped = true
    clearTimer(timer)
  }
}
