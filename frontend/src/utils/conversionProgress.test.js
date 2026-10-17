import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conversionProgressView } from './conversionProgress.js'

test('the converting stage shows pages processed and the server percentage', () => {
  assert.deepEqual(conversionProgressView({ stage: 'converting', completedPages: 12, totalPages: 20, percent: 60 }), {
    stage: 'converting',
    label: 'Converting pages…',
    detail: '12 of 20 pages processed',
    percent: 60,
  })
})

test('each stage has its own label, and only page stages show page counts', () => {
  assert.equal(conversionProgressView({ stage: 'queued', completedPages: 0, totalPages: null, percent: 0 }).label, 'Waiting to start…')
  assert.equal(conversionProgressView({ stage: 'preparing', completedPages: 0, totalPages: null, percent: 0 }).detail, 'Reading your PDF.')
  const finalizing = conversionProgressView({ stage: 'finalizing', completedPages: 20, totalPages: 20, percent: 99 })
  assert.equal(finalizing.label, 'Finalizing flipbook…')
  assert.equal(finalizing.detail, 'All 20 pages processed. Saving.')
})

test('the percentage never reaches 100 while processing and never goes outside 0-99', () => {
  assert.equal(conversionProgressView({ stage: 'finalizing', completedPages: 20, totalPages: 20, percent: 100 }).percent, 99)
  assert.equal(conversionProgressView({ stage: 'converting', completedPages: 0, totalPages: 20, percent: -5 }).percent, 0)
  assert.equal(conversionProgressView({ stage: 'converting', completedPages: 25, totalPages: 20, percent: 99 }).detail, '20 of 20 pages processed')
})

test('missing or unknown progress (an older server, or a fresh claim) shows the waiting state', () => {
  for (const progress of [null, undefined, {}, { stage: 'something-new' }]) {
    const view = conversionProgressView(progress)
    assert.equal(view.stage, 'queued')
    assert.equal(view.percent, 0)
  }
})

test('a one-page PDF uses the singular', () => {
  assert.equal(conversionProgressView({ stage: 'converting', completedPages: 0, totalPages: 1, percent: 0 }).detail, '0 of 1 page processed')
})
