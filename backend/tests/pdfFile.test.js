import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanFilename, hasPdfSignature } from '../utils/pdfFile.js'

test('accepts PDF 1.x and 2.x headers', () => {
  assert.equal(hasPdfSignature(Buffer.from('%PDF-1.7\n%âãÏÓ')), true)
  assert.equal(hasPdfSignature(Buffer.from('%PDF-2.0\n')), true)
})

test('rejects non-PDF content regardless of filename', () => {
  assert.equal(hasPdfSignature(Buffer.from('hello, this is a text file renamed to .pdf')), false)
  assert.equal(hasPdfSignature(Buffer.from('\x89PNG\r\n\x1a\n')), false)
  assert.equal(hasPdfSignature(Buffer.from(' %PDF-1.7')), false)
  assert.equal(hasPdfSignature(Buffer.alloc(0)), false)
})

test('cleanFilename strips paths and control characters', () => {
  assert.equal(cleanFilename('../../etc/brochure.pdf'), 'brochure.pdf')
  assert.equal(cleanFilename('bro\u0000chure.pdf'), 'brochure.pdf')
  assert.equal(cleanFilename(''), 'document.pdf')
})
