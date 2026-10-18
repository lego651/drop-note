/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsBar } from '../StatsBar'

describe('StatsBar', () => {
  const baseProps = {
    totalCount: 247,
    thisWeekCount: 18,
    processingCount: 3,
    topCategory: { name: 'Tech', count: 38 },
  }

  it('renders all 4 stat cards', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('Total saved')).toBeDefined()
    expect(screen.getByText('This week')).toBeDefined()
    expect(screen.getByText('Processing')).toBeDefined()
    expect(screen.getByText('Top category')).toBeDefined()
  })

  it('shows totalCount value', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('247')).toBeDefined()
  })

  it('shows thisWeekCount value', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('18')).toBeDefined()
  })

  it('shows processingCount value', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('3')).toBeDefined()
  })

  it('shows the category name without a # prefix when topCategory is provided', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('Tech')).toBeDefined()
  })

  it('shows category count subtext', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('38 items')).toBeDefined()
  })

  it('shows "—" when topCategory is null', () => {
    render(<StatsBar {...baseProps} topCategory={null} />)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('shows "no items yet" subtext when topCategory is null', () => {
    render(<StatsBar {...baseProps} topCategory={null} />)
    expect(screen.getByText('no items yet')).toBeDefined()
  })

  it('shows "all time" subtext for total saved', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('all time')).toBeDefined()
  })

  it('shows "arriving now" subtext for processing', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('arriving now')).toBeDefined()
  })

  it('renders with zero values without crashing', () => {
    render(
      <StatsBar
        totalCount={0}
        thisWeekCount={0}
        processingCount={0}
        topCategory={null}
      />
    )
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })
})
