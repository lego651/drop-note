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
})
