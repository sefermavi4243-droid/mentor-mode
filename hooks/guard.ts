// Decides which writes mentor mode lets through. The agent may write its own
// notes under .mentor/; everything else belongs to the learner.

export function isMentorPath(path: string): boolean {
  return /(^|\/)\.mentor(\/|$)/.test(path.replace(/\\/g, '/'))
}

// Redirects to nowhere are harmless and very common in read-only commands.
const HARMLESS = [
  /\d?>>?\s*\/dev\/null/g,
  /\d?>>?\s*\$null/g,
  /\d?>&\d/g,
  /\|\s*Out-Null/gi,
]

const WRITERS = [
  />/, // any remaining redirect
  /\btee\b/,
  /\b(sed|perl)\b[^|;&]*\s-i/,
  /\b(cp|mv|install|patch|truncate|dd|rm|rmdir|unlink|del|erase|rd)\s/,
  /\bgit\s+(apply|am|checkout\s+--|restore|stash\s+pop|cherry-pick|merge|rebase)\b/,
  /\b(Set-Content|Add-Content|Clear-Content|Out-File|New-Item|Copy-Item|Move-Item|Rename-Item|Remove-Item)\b/i,
  /\[IO\.File\]::Write/i,
  /\s--(write|fix)\b/, // formatters and linters rewriting files (prettier, eslint, ruff)
  /\b(python|python3|node|ruby|perl)\s+-(c|e)\b/, // inline scripts can write anything
]

export function writesFiles(command: string): boolean {
  // No .mentor/ exception here: the agent writes its notes with Write or Edit,
  // and a shell command naming .mentor/ can still touch anything else.
  const stripped = HARMLESS.reduce((text, pattern) => text.replace(pattern, ''), command)
  return WRITERS.some(pattern => pattern.test(stripped))
}
