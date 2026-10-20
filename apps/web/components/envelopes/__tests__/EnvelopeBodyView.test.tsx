/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import type { EnvelopeBody } from '@drop-note/shared'
import { EnvelopeBodyView } from '../EnvelopeBodyView'
import { toast } from '@/hooks/use-toast'

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

describe('EnvelopeBodyView — add/delete (DRO-232)', () => {
  it('adds a user line via the inline "Add item" input, sends addItem, and keeps the input open for the next one', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const input = screen.getByPlaceholderText('Add a line…')
    fireEvent.change(input, { target: { value: 'Pack sunscreen' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    expect(screen.getByText('Pack sunscreen')).toBeInTheDocument()
    expect(screen.getByText('Added by you')).toBeInTheDocument()
    // The input stays open (not collapsed back to the "Add item" button) and clears, ready for the next line.
    expect(screen.getByPlaceholderText('Add a line…')).toHaveValue('')

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'addItem', sectionIndex: 0, text: 'Pack sunscreen' })
  })

  it('Escape cancels the inline "Add item" input without sending a request', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const input = screen.getByPlaceholderText('Add a line…')
    fireEvent.change(input, { target: { value: 'Discarded' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByText('Discarded')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('(DRO-235) tapping the Save button commits the "Add item" input, for mobile where Enter is not reliable', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const input = screen.getByPlaceholderText('Add a line…')
    fireEvent.change(input, { target: { value: 'Pack sunscreen' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save this line' }))
    })

    expect(screen.getByText('Pack sunscreen')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'addItem', sectionIndex: 0, text: 'Pack sunscreen' })
  })

  it('(DRO-235) submitting the <form> (mobile keyboard Go/Done key) commits the "Add item" input', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const input = screen.getByPlaceholderText('Add a line…')
    fireEvent.change(input, { target: { value: 'Pack sunscreen' } })
    await act(async () => {
      fireEvent.submit(input.closest('form')!)
    })

    expect(screen.getByText('Pack sunscreen')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('(DRO-235) blurring away from the "Add item" input commits a non-empty value', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const input = screen.getByPlaceholderText('Add a line…')
    fireEvent.change(input, { target: { value: 'Pack sunscreen' } })
    await act(async () => {
      fireEvent.blur(input)
    })

    expect(screen.getByText('Pack sunscreen')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('(DRO-235) tapping Cancel on the "Add item" input discards the draft without sending a request', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const input = screen.getByPlaceholderText('Add a line…')
    fireEvent.change(input, { target: { value: 'Discarded' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel adding this line' }))

    expect(screen.queryByText('Discarded')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rolls back an optimistically-added line when the addItem PATCH fails', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'failed to save' }), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const input = screen.getByPlaceholderText('Add a line…')
    fireEvent.change(input, { target: { value: 'Pack sunscreen' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    // The optimistic add and its rollback can both settle within this one act()
    // flush (the mocked fetch resolves immediately), so only the final,
    // rolled-back state is asserted here — not the transient optimistic one.
    await waitFor(() => expect(screen.queryByText('Pack sunscreen')).not.toBeInTheDocument())
  })

  it('deletes a line optimistically and sends deleteItem', async () => {
    const body = checklistBody([{ text: 'Leaf A' }, { text: 'Leaf B' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove this line' })[0])
    })

    expect(screen.queryByText('Leaf A')).not.toBeInTheDocument()
    expect(screen.getByText('Leaf B')).toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'deleteItem', sectionIndex: 0, itemIndex: 0 })
  })

  it('rolls back a deleted line when the deleteItem PATCH fails', async () => {
    const body = checklistBody([{ text: 'Leaf A' }, { text: 'Leaf B' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'failed to save' }), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove this line' })[0])
    })

    // As above: the optimistic delete and its rollback can both settle
    // within this one act() flush, so only the final state is asserted.
    await waitFor(() => expect(screen.getByText('Leaf A')).toBeInTheDocument())
    expect(screen.getByText('Leaf B')).toBeInTheDocument()
  })

  it('refuses to delete the very last line of the whole plan, without ever calling the PATCH', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove this line' }))

    expect(screen.getByText('Leaf A')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Can't remove the last line" }))
  })

  it('adds a new section via the "Add section" form', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }))
    fireEvent.change(screen.getByPlaceholderText('First line in this section…'), { target: { value: 'Book flights' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add section' }))
    })

    expect(screen.getByText('Book flights')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'addSection', blockType: 'checklist', text: 'Book flights' })
  })

  it('(DRO-235) submitting the "Add section" <form> (mobile keyboard Go/Done key) commits the new section', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }))
    const textInput = screen.getByPlaceholderText('First line in this section…')
    fireEvent.change(textInput, { target: { value: 'Book flights' } })
    await act(async () => {
      fireEvent.submit(textInput.closest('form')!)
    })

    expect(screen.getByText('Book flights')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('(DRO-235) blurring away from the "Add section" form commits a non-empty first line', async () => {
    const body = checklistBody([{ text: 'Leaf A' }])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }))
    const textInput = screen.getByPlaceholderText('First line in this section…')
    fireEvent.change(textInput, { target: { value: 'Book flights' } })
    await act(async () => {
      fireEvent.blur(textInput)
    })

    expect(screen.getByText('Book flights')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})

describe('EnvelopeBodyView table block (DRO-196)', () => {
  function tableBody(): EnvelopeBody {
    return {
      sections: [
        {
          type: 'table',
          heading: 'Recipe comparison',
          columns: ['Recipe', 'Prep time'],
          rows: [
            [
              { text: 'Pasta primavera', sourceItemIds: ['item-1'], confidence: 'from_item' },
              { text: '20 min', sourceItemIds: [], confidence: 'suggested', missing: 'exact time' },
            ],
          ],
        },
      ],
    }
  }

  it('renders the heading, column headers, and row cells with citation chips', () => {
    render(
      <EnvelopeBodyView
        envelopeId="env-1"
        body={tableBody()}
        citationLabels={{ 'item-1': 'Pasta recipe' }}
      />,
    )

    expect(screen.getByText('Recipe comparison')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Recipe' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Prep time' })).toBeInTheDocument()
    expect(screen.getByText('Pasta primavera')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pasta recipe' })).toHaveAttribute('href', '/items/item-1')
    expect(screen.getByText('Missing: exact time')).toBeInTheDocument()
  })

  it('does not render a checkbox or editable input for table cells', () => {
    render(<EnvelopeBodyView envelopeId="env-1" body={tableBody()} citationLabels={{}} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('20 min'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('(DRO-235) tapping Save on the "Add row" form commits once every column is filled in', async () => {
    const body = tableBody()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }))
    fireEvent.change(screen.getByPlaceholderText('Recipe'), { target: { value: 'Soup' } })
    fireEvent.change(screen.getByPlaceholderText('Prep time'), { target: { value: '10 min' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save this row' }))
    })

    expect(screen.getByText('Soup')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ action: 'addRow', sectionIndex: 0, cells: ['Soup', '10 min'] })
  })

  it('(DRO-235) blurring away from the "Add row" form commits once every column is filled in', async () => {
    const body = tableBody()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ body }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={body} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }))
    fireEvent.change(screen.getByPlaceholderText('Recipe'), { target: { value: 'Soup' } })
    const prepTimeInput = screen.getByPlaceholderText('Prep time')
    fireEvent.change(prepTimeInput, { target: { value: '10 min' } })
    await act(async () => {
      fireEvent.blur(prepTimeInput)
    })

    expect(screen.getByText('Soup')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('(DRO-235) tapping Cancel on the "Add row" form discards the draft without sending a request', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<EnvelopeBodyView envelopeId="env-1" body={tableBody()} citationLabels={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }))
    fireEvent.change(screen.getByPlaceholderText('Recipe'), { target: { value: 'Discarded' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel adding this row' }))

    expect(screen.queryByText('Discarded')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add row' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
