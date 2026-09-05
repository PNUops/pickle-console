import { describe, expect, it } from 'vitest'

import { readPrompt } from './prompt-view'

describe('readPrompt', () => {
  it('reads the ordinary messages array role by role', () => {
    const view = readPrompt([
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: '\ud559\uc0dd \uba85\ub2e8 \uc9c0\uc6cc\uc918' },
    ])

    expect(view).toEqual({
      kind: 'messages',
      messages: [
        { role: 'system', text: 'you are helpful', nonText: 0 },
        { role: 'user', text: '\ud559\uc0dd \uba85\ub2e8 \uc9c0\uc6cc\uc918', nonText: 0 },
      ],
    })
  })

  it('reads a truncated prompt as one block rather than roles', () => {
    // Cutting a JSON array mid-way leaves nothing a parser would take, so the
    // prefix travels as a string. It cannot be split back into messages.
    const view = readPrompt('[{"role":"user","content":"\uae34 \ud504\ub86c')

    expect(view).toEqual({ kind: 'text', text: '[{"role":"user","content":"\uae34 \ud504\ub86c' })
  })

  it('keeps the text of a multipart message and counts what it dropped', () => {
    // The gateway captures the messages array as sent, so content is an array
    // on a vision request. Treating it as a string prints [object Object].
    const view = readPrompt([
      {
        role: 'user',
        content: [
          { type: 'text', text: '\uc774 \uadf8\ub9bc' },
          { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
        ],
      },
    ])

    expect(view).toEqual({
      kind: 'messages',
      messages: [{ role: 'user', text: '\uc774 \uadf8\ub9bc', nonText: 1 }],
    })
  })

  it('falls back to pretty JSON for a shape it does not know', () => {
    const view = readPrompt({ prompt: 'legacy' })

    expect(view?.kind).toBe('raw')
    expect(view?.kind === 'raw' && view.text).toContain('"prompt"')
  })

  it('has nothing to show when the prompt was not recorded', () => {
    expect(readPrompt(null)).toBeNull()
    expect(readPrompt(undefined)).toBeNull()
  })

  it('names a message whose role is missing rather than rendering undefined', () => {
    const view = readPrompt([{ content: 'hi' }])

    expect(view?.kind === 'messages' && view.messages[0].role).toBe('(\uc5ed\ud560 \uc5c6\uc74c)')
  })
})
