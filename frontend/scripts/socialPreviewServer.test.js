import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { staticFilePath } from './socialPreviewServer.js'

test('the local preview server serves only files inside dist and survives malformed paths', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'craftflip-preview-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dist = join(root, 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'assets', 'app.js'), 'app')
  // A sibling whose name starts with "dist": a plain prefix check would let it through.
  mkdirSync(join(root, 'dist-other'))
  writeFileSync(join(root, 'dist-other', 'secret.txt'), 'secret')
  writeFileSync(join(root, 'secret.txt'), 'secret')

  assert.equal(staticFilePath(dist, '/assets/app.js'), join(dist, 'assets', 'app.js'))
  for (const pathname of ['/..%2Fdist-other%2Fsecret.txt', '/..%2Fsecret.txt', '/%2e%2e%2fsecret.txt', '/..%5Csecret.txt', '/%E0%A4%A', '/assets/missing.js', '/view/some-book-ab12', '/']) {
    assert.equal(staticFilePath(dist, pathname), null, pathname)
  }
})
