/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import type { EnvelopeBody } from '@drop-note/shared'
import { EnvelopeBodyView } from '../EnvelopeBodyView'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

beforeEach(() => {
  vi.unstubAllGlobals()
})

function checklistBody(items: Array<{ text: string; checked?: boolean }>): EnvelopeBody {
  return {
    sections: [
      {
        type: 'checklist',
        items: items.map((item) => ({
          text: item.text,
          sourceItemIds: [],
          confidence: 'suggested' as const,
          checked: item.checked,
        })),
      },
    ],
  }
}

describe('EnvelopeBodyView (DRO-195)', () => {
  it('remounts and resyncs from fresh props when the key changes, as the parent does after Regenerate', () => {
    const bodyA = checklistBody([{ text: 'Old plan line', checked: true }])
    const bodyB = checklistBody([{ text: 'Fresh plan line' }])

    const { rerender } = render(<EnvelopeBodyView key="rev-1" envelopeId="env-1" body={bodyA} citationLabels={{}} />)
    expect(screen.getByText('Old plan line')).toBeInTheDocument()
    expect(screen.getByText('1/1 done')).toBeInTheDocument()

    // The parent (page.tsx) keys EnvelopeBodyView by the envelope's updated_at,
    // so a Regenerate + router.refresh() changes the key and forces exactly
    // this kind of remount rather than leaving the old useState(initialBody) in place.
    rerender(<EnvelopeBodyView key="rev-2" envelopeId="env-1" body={bodyB} citationLabels={{}} />)

    expect(screen.queryByText('Old plan line')).not.toBeInTheDocument()
    expect(screen.getByText('Fresh plan line')).toBeInTheDocument()
    expect(screen.getByText('0/1 done')).toBeInTheDocument()
  })

  it('sends the explicit target "checked" value on toggle rather than asking the server to flip it', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'))
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'toggle', checked: true })
  })

  it('serializes PATCHes and rolls back only the leaf whose PATCH failed, leaving a concurrently-toggled leaf\'s optimistic state intact', async () => {
    const body = checklistBody([{ text: 'Leaf A' }, { text: 'Leaf B' }])
    let resolveFirst!: (res: Response) => void
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    const checkboxes = screen.getAllByRole('checkbox')

    await act(async () => {
      fireEvent.click(checkboxes[0])
    })
    await act(async () => {
      fireEvent.click(checkboxes[1])
    })

    // Both leaves show the optimistic update immediately...
    expect(checkboxes[0]).toHaveAttribute('data-state', 'checked')
    expect(checkboxes[1]).toHaveAttribute('data-state', 'checked')
    // ...but leaf B's PATCH is still queued behind leaf A's still-pending one.
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFirst(new Response(JSON.stringify({ error: 'failed to save' }), { status: 500 }))

    await waitFor(() => expect(checkboxes[0]).toHaveAttribute('data-state', 'unchecked'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    // Leaf B's optimistic check survives leaf A's rollback — a whole-body
    // rollback would have wiped it out too.
    expect(checkboxes[1]).toHaveAttribute('data-state', 'checked')
  })
})
