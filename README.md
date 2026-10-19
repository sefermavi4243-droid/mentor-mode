# mentor-mode

**Your coding agent, but it refuses to do your homework.**

`mentor-mode` turns Claude Code into a mentor. It reads your code, runs your tests and asks
the right question, but it **cannot write your code**. A tool guard blocks every edit to
your files while mentor mode is on. You type. You learn. It keeps score.

```
> /mentor socratic
Mentor mode is on: socratic (answers with questions until the learner finds it).
The agent will not write your code now. Climb the hint ladder with /mentor hint.

> my binary search never ends on [1, 3]

  You said the loop stops when low > high. Pick target = 3 and walk through it:
  what are low, high and mid after the first iteration?

> low=0 high=1 mid=0... then low = mid, so low stays 0. oh.

  What would have to be true about low after each step for the range to shrink?

> /mentor hint
Hint rung 2/4: concept.

  This is the "loop invariant" idea: every iteration must make the search range
  strictly smaller. In a search over pages of a book, "go to the middle page" only
  works if you never re-open a page you already ruled out. Which line of yours
  re-opens one?

> low = mid + 1. it works.

> /mentor done
Solved on your own: 1. Hint ladder reset.
```

Status line, always visible: `mentor socratic | hint 0/4 | solved 1 | reveals 0`

## Why

AI agents made it easy to ship code you do not understand. That is fine for a deadline
and terrible for learning. Juniors are told "do not use AI while you learn", which is
like being told not to use a calculator in 2026. `mentor-mode` is the third option:
use the strongest model there is, as a teacher instead of a ghostwriter.

## What it does

| | |
|---|---|
| **Write guard** | `Write` and `Edit` to your files are denied while it is on. Shell commands that write files (`>`, `tee`, `sed -i`, `cp`, `Set-Content`, `python -c` ...) are denied too. The agent may only write its notes in `.mentor/`. |
| **Hint ladder** | Help comes in four rungs, and you choose when to climb: **nudge** (a question), **concept** (the idea, on an unrelated example), **shape** (pseudocode), **fragment** (at most 5 lines for the hardest part). |
| **Four styles** | `guide` (patient, explains), `socratic` (only questions), `reviewer` (you write, it reviews like a strict PR), `strict` ("Show me what you tried."). |
| **Honest scoreboard** | Solved on your own, hints taken, solutions revealed. Per project, kept across sessions. `/mentor reveal` exists, and it counts. |
| **Learning journal** | The agent keeps `.mentor/journal.md`: what you struggled with, what unlocked it, and a recall question for each entry. |
| **Spaced recall** | Next session it opens with a recall question from your journal, before anything else. |
| **Exams** | `/mentor exam src/parser.ts` asks three questions about the code (what it does, an edge case, a changed requirement) and grades each answer. Works great on code an AI wrote for you last week. |
| **Any language** | It answers in the language you write in. |

## Install

In Claude Code:

```
/plugin install mentor-mode --marketplace sefermavi4243-droid/mentor-mode
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install mentor-mode --marketplace sefermavi4243-droid/mentor-mode
```

### Other agents (Codex, Cursor, Copilot, Gemini CLI)

Copy [`portable/AGENTS.md`](portable/AGENTS.md) into your `AGENTS.md`, `.cursor/rules/` or custom
instructions. You get the same teaching contract, styles, hint ladder, journal and exams, steered with
plain words (`hint`, `reveal`, `done`, `exam`). The write guard and the scoreboard need the plugin.

## Commands

| Command | |
|---|---|
| `/mentor` | Turn on (or show the scoreboard when on) |
| `/mentor guide\|socratic\|reviewer\|strict` | Turn on in that style |
| `/mentor hint` | Climb one rung |
| `/mentor reveal` | Full solution, walked through line by line. Counts as a reveal. |
| `/mentor done` | Mark the problem solved; resets the ladder |
| `/mentor exam [path]` | Three questions, graded |
| `/mentor status` | Scoreboard |
| `/mentor off` | Back to a normal agent |

## For teachers and bootcamps

Commit `portable/AGENTS.md` into an assignment repo and every student's agent becomes a tutor
for that repo. Ask students to hand in `.mentor/journal.md` with their solution: it shows how they
got there, not only where they ended up.

## How it works

`mentor-mode` is a Claude Code hooks module ([`hooks/register.ts`](hooks/register.ts)):

- a `tool.call` guard on `Write`, `Edit`, `NotebookEdit`, `Bash` and `PowerShell`;
- a `prompt.submit` hook that hands the model the teaching contract
  ([`hooks/teaching.ts`](hooks/teaching.ts)) when it changes, and a one-line reminder otherwise;
- the `/mentor` command, with progress kept in the plugin's store, per project.

`portable/AGENTS.md` is generated from the same `teaching.ts`, so the two never drift:

```
npm run build:portable
```

Tests run against the real engine:

```
claude plugin test .
```

### Limits, honestly

The shell guard is a heuristic. It catches the ways an agent normally writes files, not every way a
determined one could. The real defense is the contract: the model is told plainly that you are learning,
and it cooperates. If you want the answer badly enough, `/mentor off` is right there. That is the point:
it is your call, made on purpose.

## Contributing

Ideas that would make this better: more styles (a "rubber duck" that only listens, an
"interviewer" for practice), exercises generated from your own repo, a weekly progress summary from the
journal. Issues and pull requests are welcome. Please write them yourself.

## Türkçe

`mentor-mode`, Claude Code'u bir mentora dönüştürür: kodunu okur, testlerini çalıştırır, doğru soruyu
sorar ama **senin yerine kod yazamaz**. İpuçları dört basamakta gelir, ne zaman çıkacağına sen karar
verirsin. Öğrendiklerin `.mentor/journal.md` dosyasına yazılır, bir sonraki oturum bir hatırlatma
sorusuyla başlar. Hangi dilde yazarsan o dilde cevap verir.

## License

MIT
