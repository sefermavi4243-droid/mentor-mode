# Contributing

Issues and pull requests are welcome.

## Setup

1. Clone the repo.
2. Install [Claude Code](https://docs.claude.com/en/docs/claude-code).
3. Load the plugin from the repo folder.

## Checks

Run these before opening a pull request:

```sh
npm run validate
npm test
npm run build:portable
```

`portable/AGENTS.md` is generated from `hooks/teaching.ts`. Edit the source, then rebuild; do not edit the generated file by hand.

## Style

- No emojis in code, docs or output.
- Keep commits small, with a short imperative subject line.
- Add a line to `CHANGELOG.md` for user-facing changes.
