import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isMentorPath, writesFiles } from './guard'

const ROOT = 'C:/work/app'

// The world beneath the plugin: a store, a project root, and a recorder for
// the prompts the plugin submits and the tool calls that get through.
function world(on: On, entries: Record<string, unknown> = {}) {
  mock.store(on, entries)
  const clock = mock.clock(on)
  const submitted: string[] = []
  const notes: string[] = []
  const ran: string[] = []
  on('session.root', () => ({ value: ROOT }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    notes.push(...(e.context ?? []))
    return { text: e.text }
  })
  on('tool.call', ($, e) => {
    ran.push(e.tool)
    return { result: 'ok' }
  })
  return { submitted, notes, ran, clock }
}

// The kit fills in what the engine stamps (origin, presentation, wait).
const mentor = ($: Engine, args: string) =>
  $.command.run({ command: 'mentor', args } as Parameters<Engine['command']['run']>[0])
const say = ($: Engine, text: string) =>
  $.prompt.submit({ text } as Parameters<Engine['prompt']['submit']>[0])

const ON = { [`project:${ROOT}`]: { isOn: true, level: 'socratic', rung: 0 } }

describe('the write guard', () => {
  test('blocks edits to the learner\'s code while on', async ($, on) => {
    const { ran } = world(on, ON)
    const done = await $.tool.call({ tool: 'Edit', file_path: 'src/app.ts', old_string: 'a', new_string: 'b' })
    expect(done.deny ?? done.text).toContain('mentor-mode')
    expect(ran).toEqual([])
  })

  test('lets the agent write its journal under .mentor/', async ($, on) => {
    const { ran } = world(on, ON)
    await $.tool.call({ tool: 'Write', file_path: '.mentor/journal.md', content: '## today' })
    expect(ran).toEqual(['Write'])
  })

  test('blocks shell redirects into files but not read-only commands', async ($, on) => {
    const { ran } = world(on, ON)
    await $.tool.call({ tool: 'Bash', command: 'echo "x" > src/app.ts' })
    await $.tool.call({ tool: 'Bash', command: 'npm test 2>&1 | tail -20' })
    expect(ran).toEqual(['Bash'])
  })

  test('stays out of the way while off', async ($, on) => {
    const { ran } = world(on)
    await $.tool.call({ tool: 'Edit', file_path: 'src/app.ts', old_string: 'a', new_string: 'b' })
    expect(ran).toEqual(['Edit'])
  })
})

describe('/mentor', () => {
  test('turns on at a level and starts the session', async ($, on) => {
    const { submitted, clock } = world(on)
    const { text } = await mentor($, 'strict')
    await clock.advance(1)
    expect(text).toContain('strict')
    expect(submitted.length).toBe(1)
  })

  test('climbs the hint ladder one rung at a time', async ($, on) => {
    const { submitted, clock } = world(on, ON)
    await mentor($, 'hint')
    const { text } = await mentor($, 'hint')
    await clock.advance(1)
    expect(text).toContain('2/4')
    expect(submitted[1]).toContain('rung 2')
  })

  test('a solved problem counts only without a reveal', async ($, on) => {
    world(on, ON)
    await mentor($, 'reveal')
    const { text } = await mentor($, 'done')
    expect(text).toContain('does not count')
  })
})

describe('the teaching contract', () => {
  test('rides along in full once, then as a short reminder', async ($, on) => {
    const { notes } = world(on, ON)
    await say($, 'my loop never ends')
    await say($, 'still stuck')
    expect(notes[0]).toContain('Mentor mode is ON')
    expect(notes[1]).toContain('Still on: socratic')
  })

  test('stays silent while off', async ($, on) => {
    const { notes } = world(on)
    await say($, 'write me a parser')
    expect(notes).toEqual([])
  })
})

describe('the shell heuristic', () => {
  test('knows writes from reads', () => {
    expect(writesFiles('cat a.txt | grep foo')).toBe(false)
    expect(writesFiles('ls 2>/dev/null')).toBe(false)
    expect(writesFiles('npm test 2>&1')).toBe(false)
    expect(writesFiles('git diff HEAD~1')).toBe(false)
    expect(writesFiles('echo hi >> notes.txt')).toBe(true)
    expect(writesFiles("sed -i 's/a/b/' x.js")).toBe(true)
    expect(writesFiles('Set-Content -Path x.js -Value 1')).toBe(true)
    expect(writesFiles('python -c "open(\'x\',\'w\')"')).toBe(true)
    expect(writesFiles('git apply fix.patch')).toBe(true)
  })

  test('knows the mentor folder on any platform', () => {
    expect(isMentorPath('.mentor/journal.md')).toBe(true)
    expect(isMentorPath('C:\\proj\\.mentor\\journal.md')).toBe(true)
    expect(isMentorPath('src/mentor.ts')).toBe(false)
  })
})
