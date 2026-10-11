import { describe, it, expect } from 'vitest'
import { escapeHtml, htmlToText } from '../html'

describe('escapeHtml', () => {
  it('escapes all five special characters', () => {
    expect(escapeHtml(`<a href="x">it's & "quoted"</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; &quot;quoted&quot;&lt;/a&gt;',
    )
  })
})

describe('htmlToText', () => {
  it('returns an empty string for empty or whitespace-only input', () => {
    expect(htmlToText('')).toBe('')
    expect(htmlToText('   \n  ')).toBe('')
  })

  it('strips tags and preserves link hrefs alongside visible text', () => {
    const html = '<html><body><p>Check out <a href="https://example.com/article">this article</a></p></body></html>'
    const text = htmlToText(html)
    expect(text).toContain('this article (https://example.com/article)')
  })

  it('preserves a bare link with no visible label text', () => {
    const html = '<a href="https://example.com/article"></a>'
    expect(htmlToText(html)).toBe('https://example.com/article')
  })

  it('drops script and style blocks entirely', () => {
    const html = '<style>.a{color:red}</style><p>Hello</p><script>alert(1)</script>'
    const text = htmlToText(html)
    expect(text).toBe('Hello')
  })

  it('decodes common HTML entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &nbsp;&mdash;&nbsp; a &quot;classic&quot;</p>')).toContain('Tom & Jerry')
  })

  it('collapses block tags into line breaks without losing words', () => {
    const html = '<div>Line one</div><div>Line two</div>'
    const text = htmlToText(html)
    expect(text.split('\n')).toEqual(['Line one', 'Line two'])
  })

  it('decodes hex and decimal numeric entities, including code points above 0xFFFF', () => {
    expect(htmlToText('<p>caf&#x65;&#769;</p>')).toBe('café')
    expect(htmlToText('<p>&#128512;</p>')).toBe('\u{1F600}')
  })

  it('ignores out-of-range numeric entities instead of throwing', () => {
    expect(() => htmlToText('<p>&#x110000;</p>')).not.toThrow()
  })

  describe('pathological input stays near-linear time', () => {
    const BUDGET_MS = 500

    // Regression coverage for the catastrophic backtracking the Code Reviewer found in
    // DRO-26: `[^>]*` character classes could scan across unclosed tags to the end of
    // the input, which went cubic on unclosed <a> tags and quadratic on bare `<`/`<p`.
    // `[^<>]*` bounds each scan to the next angle bracket instead.
    it('handles many unclosed anchor tags', () => {
      const html = '<a href="x" '.repeat(Math.ceil(50_000 / 12))
      const start = Date.now()
      htmlToText(html)
      expect(Date.now() - start).toBeLessThan(BUDGET_MS)
    })

    it('handles a long run of bare "<"', () => {
      const html = '<'.repeat(50_000)
      const start = Date.now()
      htmlToText(html)
      expect(Date.now() - start).toBeLessThan(BUDGET_MS)
    })

    it('handles a long run of unclosed "<p"', () => {
      const html = '<p'.repeat(50_000)
      const start = Date.now()
      htmlToText(html)
      expect(Date.now() - start).toBeLessThan(BUDGET_MS)
    })

    it('handles many well-formed anchors quickly too', () => {
      const html = '<a href="https://example.com">link</a>'.repeat(10_000)
      const start = Date.now()
      htmlToText(html)
      expect(Date.now() - start).toBeLessThan(BUDGET_MS)
    })

    it('caps input length as defense in depth against oversized payloads', () => {
      const html = `<a href="x" ${'z'.repeat(300_000)}>`
      const start = Date.now()
      htmlToText(html)
      expect(Date.now() - start).toBeLessThan(BUDGET_MS)
    })
  })
})
