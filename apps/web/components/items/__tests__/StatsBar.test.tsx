/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsBar } from '../StatsBar'

describe('StatsBar', () => {
  const baseProps = {
    totalCount: 247,
    thisWeekCount: 18,
    processingCount: 3,
    topTag: { name: 'ai', count: 38 },
  }

  it('renders all 4 stat cards', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('Total saved')).toBeDefined()
    expect(screen.getByText('This week')).toBeDefined()
    expect(screen.getByText('Processing')).toBeDefined()
    expect(screen.getByText('Top tag')).toBeDefined()
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

  it('shows #tagname when topTag is provided', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('#ai')).toBeDefined()
  })

  it('shows tag count subtext', () => {
    render(<StatsBar {...baseProps} />)
    expect(screen.getByText('38 items')).toBeDefined()
  })

  it('shows "#—" when topTag is null', () => {
    render(<StatsBar {...baseProps} topTag={null} />)
    expect(screen.getByText('#—')).toBeDefined()
  })

  it('shows "no tags yet" subtext when topTag is null', () => {
    render(<StatsBar {...baseProps} topTag={null} />)
    expect(screen.getByText('no tags yet')).toBeDefined()
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
        topTag={null}
      />
    )
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })
})
