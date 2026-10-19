import { describe, expect, test } from 'claude-code/testing'

import { dateOf, parseJournal, renderCard, summarize } from './wrapped'
import type { Activity } from './wrapped'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 9, 20, 18, 0).getTime()
const at = (daysAgo: number, kind: Activity['kind']): Activity => ({ at: NOW - daysAgo * DAY, kind })

const JOURNAL = `# Mentor journal

## 2026-10-20 - loop invariants
- struggled with: low never moved
- recall question: what must shrink every iteration?

## 2026-10-19 - closures (revealed)
- recall question: what does a closure capture?

## 2026-10-18 - exam: search.js

## 2026-09-01 - very old topic
`

describe('the journal', () => {
  test('reads dated entries and their tags', () => {
    expect(parseJournal(JOURNAL)).toEqual([
      { date: '2026-10-20', title: 'loop invariants', isExam: false, isRevealed: false },
      { date: '2026-10-19', title: 'closures', isExam: false, isRevealed: true },
      { date: '2026-10-18', title: 'search.js', isExam: true, isRevealed: false },
      { date: '2026-09-01', title: 'very old topic', isExam: false, isRevealed: false },
    ])
  })

  test('ignores headings that are not entries', () => {
    expect(parseJournal('# Mentor journal\n## notes\ntext')).toEqual([])
  })
})

describe('the week', () => {
  const history = [
    at(0, 'hint'), at(0, 'solved'), at(1, 'solved'), at(1, 'reveal'), at(2, 'exam'), at(2, 'kata'), at(30, 'solved'),
  ]
  const week = summarize(history, parseJournal(JOURNAL), NOW)

  test('counts only the last seven days', () => {
    expect([week.solved, week.hints, week.reveals, week.exams, week.katas]).toEqual([2, 1, 1, 1, 1])
    expect(week.from).toBe(dateOf(NOW - 6 * DAY))
    expect(week.to).toBe('2026-10-20')
  })

  test('scores independence from solves and reveals', () => {
    expect(week.independence).toBe(67)
    expect(summarize([], [], NOW).independence).toBe(null)
  })

  test('lists this week\'s concepts, not exams or old topics', () => {
    expect(week.concepts).toEqual(['loop invariants', 'closures'])
  })

  test('counts a streak of consecutive active days', () => {
    expect(week.streak).toBe(3)
    expect(week.days.map(d => d.isActive)).toEqual([false, false, false, false, true, true, true])
  })

  test('keeps a streak alive until the day is over', () => {
    expect(summarize([at(1, 'hint'), at(2, 'hint')], [], NOW).streak).toBe(2)
  })
})

describe('the card', () => {
  test('leads with problems solved and carries the repo link', () => {
    const html = renderCard(summarize([at(0, 'solved')], [], NOW), 'github.com/someone/mentor-mode')
    expect(html).toContain('<div class="big">1</div>')
    expect(html).toContain('problem solved on my own this week')
    expect(html).toContain('github.com/someone/mentor-mode')
  })

  test('escapes what the journal says', () => {
    const journal = parseJournal('## 2026-10-20 - <script>alert(1)</script>')
    const html = renderCard(summarize([], journal, NOW), 'x')
    expect(html).not.toContain('<script>')
  })
})
