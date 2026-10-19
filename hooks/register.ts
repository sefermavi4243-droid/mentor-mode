import type { EngineInterface, Register } from 'claude-code'

import { contract, DEFAULT_LEVEL, EXAM, KATA, LEVELS, REVEAL, RUNGS } from './teaching'
import type { Level } from './teaching'
import { isKataSolution, isMentorPath, writesFiles } from './guard'
import { parseJournal, renderCard, summarize } from './wrapped'
import type { Activity } from './wrapped'

type Progress = {
  isOn: boolean
  level: Level
  rung: number
  hints: number
  reveals: number
  solved: number
  history: Activity[]
}

const OFF: Progress = { isOn: false, level: DEFAULT_LEVEL, rung: 0, hints: 0, reveals: 0, solved: 0, history: [] }

// Enough for months of daily use; the store holds 4 MiB in all.
const HISTORY_LIMIT = 2000

async function record($: EngineInterface, p: Progress, kind: Activity['kind']): Promise<Activity[]> {
  return [...p.history, { at: await $.clock.now(), kind }].slice(-HISTORY_LIMIT)
}

const REPO = 'github.com/sefermavi4243-droid/mentor-mode'

const USAGE = [
  'Usage: /mentor [on|off|guide|socratic|reviewer|strict|hint|reveal|done|exam [path]|kata [path]|wrapped|status]',
  '',
  ...Object.entries(LEVELS).map(([name, { summary }]) => `  ${name.padEnd(9)} ${summary}`),
].join('\n')

// Progress is kept per project, so learning Rust in one repo and Go in
// another keeps two separate scoreboards.
async function keyOf($: EngineInterface): Promise<string> {
  try {
    return `project:${await $.session.root()}`
  } catch {
    return 'project:default'
  }
}

async function load($: EngineInterface): Promise<Progress> {
  const saved = await $.store.get(await keyOf($))
  return { ...OFF, ...(saved as Partial<Progress> | undefined) }
}

async function save($: EngineInterface, progress: Progress): Promise<Progress> {
  await $.store.set(await keyOf($), progress)
  showStatus($, progress)
  return progress
}

function rungName(index: number): string {
  return RUNGS[index]?.split(':')[0] ?? ''
}

function showStatus($: EngineInterface, p: Progress) {
  $.ui.status(
    p.isOn
      ? `mentor ${p.level} | hint ${p.rung}/${RUNGS.length} | solved ${p.solved} | reveals ${p.reveals}`
      : undefined,
  )
}

function scoreboard(p: Progress): string {
  if (!p.isOn) return 'Mentor mode is off. Run /mentor to turn it on.'
  const rung = p.rung === 0 ? 'none yet' : rungName(p.rung - 1)
  return [
    `Mentor mode is on: ${p.level} (${LEVELS[p.level].summary}).`,
    `Current hint rung: ${p.rung}/${RUNGS.length} (${rung}).`,
    `Solved on your own: ${p.solved}. Hints taken: ${p.hints}. Solutions revealed: ${p.reveals}.`,
  ].join('\n')
}

// The card is the plugin's own write, not the agent's, so the guard does not
// apply; it works whether mentor mode is on or off.
async function wrapped($: EngineInterface, p: Progress): Promise<string> {
  const root = await $.session.root()
  const journal = await $.fs.read(`${root}/.mentor/journal.md`).then(String, () => '')
  const week = summarize(p.history, parseJournal(journal), await $.clock.now())
  const path = `${root}/.mentor/wrapped.html`
  await $.fs.write(path, renderCard(week, REPO))
  const independence = week.independence === null ? '' : `, ${week.independence}% independence`
  return [
    `Your week (${week.from} to ${week.to}): ${week.solved} solved on your own, ${week.hints} hints, ${week.reveals} reveals${independence}, ${week.streak}-day streak.`,
    `Card written to ${path}`,
    'Open it in a browser and take a screenshot to share it.',
  ].join('\n')
}

const BLOCKED =
  'mentor-mode: the learner writes their own code while mentor mode is on. ' +
  'Do not retry this through another tool or a shell command. ' +
  'Guide them to make the change themselves, at the current hint rung. ' +
  'You may write inside .mentor/ only. (The learner can run /mentor off to stop.)'

const KATA_BLOCKED =
  'mentor-mode: this kata solution belongs to the learner now. Do not edit it or write it another way. ' +
  'Help them at the current hint rung instead.'

export const register: Register = on => {
  let lastSent = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mentor',
      description: 'Learn by doing: the agent teaches instead of writing your code',
      argumentHint: '[on|off|guide|socratic|reviewer|strict|hint|reveal|done|exam|kata|wrapped|status]',
    })
    showStatus($, await load($))
    return next(e)
  })

  on('command.run', { command: 'mentor' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const p = await load($)
    // A command.run hook holds the session until it returns, so the follow-up
    // prompt is sent once it has: the agent answers right away, no Enter needed.
    const ask = (text: string) => void $.clock.after(0, () => $.prompt.submit({ text }).catch(() => {}))

    if (verb === '' && p.isOn) return { text: scoreboard(p) }
    if (verb === '' || verb === 'on' || verb in LEVELS) {
      const level = verb in LEVELS ? (verb as Level) : p.level
      const next = await save($, { ...p, isOn: true, level })
      lastSent = ''
      ask('Mentor mode is on. Check .mentor/journal.md for a recall question, then ask me what I am working on.')
      return { text: `${scoreboard(next)}\nThe agent will not write your code now. Climb the hint ladder with /mentor hint.` }
    }
    if (verb === 'off') {
      await save($, { ...p, isOn: false, rung: 0 })
      return { text: 'Mentor mode is off. The agent can write code again.' }
    }
    if (verb === 'status') return { text: scoreboard(p) }
    if (verb === 'wrapped') return { text: await wrapped($, p) }
    if (!p.isOn) return { text: `Mentor mode is off. Run /mentor first.\n\n${USAGE}` }

    if (verb === 'hint') {
      if (p.rung >= RUNGS.length) {
        return { text: 'You are on the last rung. Try it, or run /mentor reveal to see a full solution.' }
      }
      const next = await save($, { ...p, rung: p.rung + 1, hints: p.hints + 1, history: await record($, p, 'hint') })
      ask(`Give me the rung ${next.rung} hint (${RUNGS[next.rung - 1]}) for what I am stuck on.`)
      return { text: `Hint rung ${next.rung}/${RUNGS.length}: ${rungName(next.rung - 1)}.` }
    }
    if (verb === 'reveal') {
      await save($, { ...p, rung: RUNGS.length, reveals: p.reveals + 1, history: await record($, p, 'reveal') })
      ask(REVEAL)
      return { text: 'Revealing the solution. It counts on your scoreboard; retype it from memory afterwards.' }
    }
    if (verb === 'done') {
      const isOwn = p.rung < RUNGS.length
      const next = await save($, {
        ...p,
        rung: 0,
        solved: p.solved + (isOwn ? 1 : 0),
        history: isOwn ? await record($, p, 'solved') : p.history,
      })
      ask('I solved it. Ask me to explain my solution in two sentences, then add the journal entry.')
      return {
        text: isOwn
          ? `Solved on your own: ${next.solved}. Hint ladder reset.`
          : 'Done. It used a revealed solution, so it does not count as solved on your own. Hint ladder reset.',
      }
    }
    if (verb === 'kata') {
      await save($, { ...p, rung: 0, history: await record($, p, 'kata') })
      ask(KATA(rest.join(' ')))
      return { text: 'Building a kata from your own codebase. You write the solution; the tests tell you when it works.' }
    }
    if (verb === 'exam') {
      await save($, { ...p, history: await record($, p, 'exam') })
      ask(EXAM(rest.join(' ')))
      return { text: 'Exam time: three questions, no hints.' }
    }
    return { text: USAGE }
  })

  // The full contract rides along with a prompt whenever it changed (first
  // prompt, new level, new rung); otherwise a one-line reminder keeps the
  // transcript small. prompt.submit runs in every install, managed or not.
  on('prompt.submit', async ($, e, next) => {
    const p = await load($)
    if (!p.isOn || e.command) return next(e)
    const full = contract(p.level, p.rung)
    const note = full === lastSent
      ? `[mentor-mode] Still on: ${p.level}, hint rung ${p.rung}/${RUNGS.length}. Teach, do not write their code.`
      : full
    lastSent = full
    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('tool.call', { tool: /^(Write|Edit)$/ }, async ($, e, next) => {
    const p = await load($)
    const path = (e as { file_path?: string }).file_path ?? ''
    if (!p.isOn) return next(e)
    if (!isMentorPath(path)) return { deny: BLOCKED }
    // The stub may be written once; after that the file is the learner's.
    const exists = await $.fs.stat(path).then(() => true, () => false)
    return isKataSolution(path) && exists ? { deny: KATA_BLOCKED } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'mentor-mode: its guard failed.' }))

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const p = await load($)
    return p.isOn && !isMentorPath(e.notebook_path) ? { deny: BLOCKED } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'mentor-mode: its guard failed.' }))

  on('tool.call', { tool: /^(Bash|PowerShell)$/ }, async ($, e, next) => {
    const p = await load($)
    const command = (e as { command?: string }).command ?? ''
    return p.isOn && writesFiles(command) ? { deny: BLOCKED } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'mentor-mode: its guard failed.' }))
}
