// What the dashboard shows for a flipbook whose conversion is running, from the server's
// conversionProgress ({ stage, completedPages, totalPages, percent }). Nothing is estimated:
// the percentage is the share of pages already stored, and the server keeps it below 100
// until the flipbook is Ready.

const STAGE_LABELS = {
  queued: 'Waiting to start…',
  preparing: 'Preparing PDF…',
  converting: 'Converting pages…',
  finalizing: 'Finalizing flipbook…',
}

function pagesLabel(count) {
  return count === 1 ? '1 page' : `${count} pages`
}

export function conversionProgressView(progress) {
  const stage = STAGE_LABELS[progress?.stage] ? progress.stage : 'queued'
  const totalPages = progress?.totalPages ?? null
  const completedPages = Math.min(progress?.completedPages ?? 0, totalPages ?? 0)
  const percent = Math.max(0, Math.min(99, Math.round(progress?.percent ?? 0)))

  let detail = null
  if (stage === 'preparing') detail = 'Reading your PDF.'
  if (stage === 'converting' && totalPages) detail = `${completedPages} of ${pagesLabel(totalPages)} processed`
  if (stage === 'finalizing' && totalPages) detail = `All ${pagesLabel(totalPages)} processed. Saving.`

  return { stage, label: STAGE_LABELS[stage], detail, percent }
}
