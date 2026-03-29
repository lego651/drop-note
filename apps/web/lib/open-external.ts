/**
 * Opens a URL in a new browsing context with noopener/noreferrer (avoids tab-nabbing).
 * Use this instead of nested `<a>` when the control sits inside a parent link (e.g. item card).
 */
export function openExternalUrl(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.click()
}
