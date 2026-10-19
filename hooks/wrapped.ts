// /mentor wrapped: a week of learning as one shareable HTML card, built from
// the plugin's activity history and the journal the agent keeps.

export type Activity = { at: number; kind: 'hint' | 'reveal' | 'solved' | 'exam' }

export type JournalEntry = { date: string; title: string; isExam: boolean; isRevealed: boolean }

export type Week = {
  from: string
  to: string
  solved: number
  hints: number
  reveals: number
  exams: number
  // Share of finished problems solved without a reveal; null with none finished.
  independence: number | null
  concepts: string[]
  streak: number
  // One flag per day, oldest first, ending today.
  days: { date: string; isActive: boolean }[]
}

const DAY = 24 * 60 * 60 * 1000

export function dateOf(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Entries look like "## 2026-10-20 - loop invariants", as the contract asks.
export function parseJournal(text: string): JournalEntry[] {
  const entries: JournalEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^##\s+(\d{4}-\d{2}-\d{2})\s*[-:]\s*(.+?)\s*$/.exec(line)
    if (!match?.[1] || !match[2]) continue
    const raw = match[2]
    entries.push({
      date: match[1],
      title: raw.replace(/\(revealed\)/gi, '').replace(/^exam\b\s*[-:]?\s*/i, '').trim() || raw,
      isExam: /\bexam\b/i.test(raw),
      isRevealed: /\(revealed\)/i.test(raw),
    })
  }
  return entries
}

export function summarize(history: readonly Activity[], journal: readonly JournalEntry[], now: number): Week {
  const days = Array.from({ length: 7 }, (_, i) => dateOf(now - (6 - i) * DAY))
  const from = days[0] ?? dateOf(now)
  const inWeek = history.filter(a => dateOf(a.at) >= from)
  const count = (kind: Activity['kind']) => inWeek.filter(a => a.kind === kind).length
  const solved = count('solved')
  const reveals = count('reveal')

  const activeDates = new Set([
    ...history.map(a => dateOf(a.at)),
    ...journal.map(e => e.date),
  ])

  // A streak still counts if today has nothing yet but yesterday did.
  let streak = 0
  let day = activeDates.has(dateOf(now)) ? now : now - DAY
  while (activeDates.has(dateOf(day))) {
    streak += 1
    day -= DAY
  }

  const concepts = [...new Set(
    journal.filter(e => e.date >= from && !e.isExam).map(e => e.title),
  )].slice(0, 8)

  return {
    from,
    to: dateOf(now),
    solved,
    hints: count('hint'),
    reveals,
    exams: count('exam'),
    independence: solved + reveals === 0 ? null : Math.round((solved / (solved + reveals)) * 100),
    concepts,
    streak,
    days: days.map(date => ({ date, isActive: activeDates.has(date) })),
  }
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T12:00:00`).getDay()] ?? ''
}

export function headline(week: Week): { big: string; line: string } {
  if (week.solved > 0) {
    return {
      big: String(week.solved),
      line: week.solved === 1 ? 'problem solved on my own this week' : 'problems solved on my own this week',
    }
  }
  if (week.concepts.length > 0) return { big: String(week.concepts.length), line: 'new concepts this week' }
  return { big: String(week.days.filter(d => d.isActive).length), line: 'days of learning this week' }
}

export function renderCard(week: Week, repo: string): string {
  const { big, line } = headline(week)
  const stats = [
    ['independence', week.independence === null ? '-' : `${week.independence}%`],
    ['hints taken', String(week.hints)],
    ['solutions revealed', String(week.reveals)],
    ['exams', String(week.exams)],
    ['day streak', String(week.streak)],
  ]
  const chips = week.concepts.length > 0
    ? week.concepts.map(c => `<span class="chip">${escape(c)}</span>`).join('')
    : '<span class="chip empty">the journal fills this in as you learn</span>'
  const days = week.days
    .map(d => `<div class="day${d.isActive ? ' on' : ''}"><i></i><span>${weekday(d.date)}</span></div>`)
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My week with mentor-mode</title>
<style>
  :root {
    --bg: #0b0d12; --card: #12151d; --line: #232838; --text: #eef0f6; --dim: #8a90a6;
    --accent: #7ee0b5; --accent-dim: #1f3b33;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--bg); color: var(--text); min-height: 100vh;
    display: grid; place-items: center; padding: 24px 16px;
    font: 16px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    width: min(1200px, 100%); aspect-ratio: 1200 / 630; container-type: inline-size;
    background: radial-gradient(120% 140% at 0% 0%, #17202a 0%, var(--card) 55%);
    border: 1px solid var(--line); border-radius: 28px; padding: 5cqw 5.5cqw;
    display: grid; grid-template-columns: 1.15fr 1fr; grid-template-rows: auto 1fr auto; gap: 2.5cqw 4cqw;
  }
  .top { grid-column: 1 / -1; display: flex; justify-content: space-between; color: var(--dim); font-size: 1.5cqw; letter-spacing: .02em; }
  .top b { color: var(--text); font-weight: 600; }
  .hero { display: flex; flex-direction: column; justify-content: center; }
  .big { font-size: 16cqw; line-height: .9; font-weight: 800; letter-spacing: -.04em; color: var(--accent); font-variant-numeric: tabular-nums; }
  .line { font-size: 3cqw; font-weight: 600; margin-top: 1cqw; max-width: 22ch; }
  .chips { display: flex; flex-wrap: wrap; gap: .8cqw; margin-top: 2.5cqw; }
  .chip { font-size: 1.45cqw; padding: .55cqw 1.2cqw; border-radius: 999px; background: var(--accent-dim); color: var(--accent); }
  .chip.empty { background: transparent; border: 1px dashed var(--line); color: var(--dim); }
  .side { display: flex; flex-direction: column; justify-content: center; gap: 2.4cqw; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1.6cqw 2cqw; }
  .stat b { display: block; font-size: 4.2cqw; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat span { color: var(--dim); font-size: 1.45cqw; }
  .stat:first-child { grid-column: 1 / -1; }
  .stat:first-child b { font-size: 6cqw; }
  .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: .8cqw; }
  .day { display: grid; gap: .5cqw; justify-items: center; color: var(--dim); font-size: 1.2cqw; }
  .day i { width: 100%; aspect-ratio: 1; border-radius: .8cqw; background: #1a1f2b; border: 1px solid var(--line); }
  .day.on i { background: var(--accent); border-color: var(--accent); }
  .foot { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: end; color: var(--dim); font-size: 1.4cqw; border-top: 1px solid var(--line); padding-top: 1.8cqw; }
  .foot b { color: var(--text); font-size: 1.9cqw; }
</style>
</head>
<body>
<main class="card">
  <div class="top"><span><b>My week with mentor-mode</b></span><span>${week.from} to ${week.to}</span></div>
  <section class="hero">
    <div class="big">${big}</div>
    <div class="line">${line}</div>
    <div class="chips">${chips}</div>
  </section>
  <section class="side">
    <div class="stats">${stats.map(([label, value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('')}</div>
    <div class="days">${days}</div>
  </section>
  <div class="foot"><span>My coding agent teaches instead of writing my code.</span><b>${escape(repo)}</b></div>
</main>
</body>
</html>
`
}
