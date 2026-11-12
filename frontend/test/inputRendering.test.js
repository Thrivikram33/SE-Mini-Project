import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const payloads = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '<div><b>nested</div>',
]

test('React text rendering escapes user-controlled markup and preserves the text', () => {
  for (const payload of payloads) {
    const markup = renderToStaticMarkup(React.createElement('p', null, payload))
    assert.equal(markup.includes('<script>'), false)
    assert.equal(markup.includes('<img'), false)
    assert.equal(markup.includes('<svg'), false)
    if (payload.includes('<') || payload.includes('&')) assert.equal(markup.includes(payload), false)
    assert.ok(markup.startsWith('<p>') && markup.endsWith('</p>'))
  }
})
