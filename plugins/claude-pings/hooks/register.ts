import type { EngineInterface, Register } from 'claude-code'

// claude-pings: a Mac notification whenever Claude needs you, titled with the
// session's title (the same name the app lists it under) and saying what it
// needs ("Done: ...", "Question: ...", "Needs OK: ..."). It only observes:
// every hook calls next(e).

type Pending = { id: number; tool: string; title: string; body: string; timer?: { cancel: () => void } }

const TERMINAL_APPS: Record<string, string> = {
  Apple_Terminal: 'com.apple.Terminal',
  'iTerm.app': 'com.googlecode.iterm2',
  ghostty: 'com.mitchellh.ghostty',
  WarpTerminal: 'dev.warp.Warp-Stable',
  vscode: 'com.microsoft.VSCode',
  WezTerm: 'com.github.wez.wezterm',
}
const NOTIFIER_PATHS = ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier']

// Module state: a hot reload starts it over, which only loses an unsent reminder.
const cfg = { remindMs: 5 * 60_000, useAi: true, doneSound: 'Glass', attentionSound: 'Ping' }
const group = `claude-pings-${crypto.randomUUID()}`
// The session's title as the app shows it; until the app has one, a name the
// mod writes once from the first request and keeps.
let appTitle: string | undefined
let ownTitle: Promise<string> | undefined
let lastPrompt = ''
let pending: Pending | undefined
let nextId = 0
let notifier: Promise<string | undefined> | undefined
let appId: Promise<string | undefined> | undefined
let project: Promise<string> | undefined

function oneLine(s: string, max: number) {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function firstWords(s: string, n: number) {
  return oneLine(s, 200).split(' ').slice(0, n).join(' ')
}

async function ask($: EngineInterface, prompt: string, maxTokens: number) {
  if (!cfg.useAi) return undefined
  try {
    const r = await $.model.complete({ model: 'haiku', prompt, maxTokens, effort: 'low' })
    return r.isAnswered ? oneLine(r.text.replace(/^["'“]|["'”.]$/g, ''), 120) || undefined : undefined
  } catch {
    return undefined
  }
}

async function nameSession($: EngineInterface, text: string) {
  const name = await ask(
    $,
    `Write a title for a work session that starts with this request: 3 to 6 words, sentence case, ` +
      `no punctuation, no quotes. Reply with the title only.\n\nRequest:\n${text.slice(0, 3000)}`,
    24,
  )
  return name ?? (firstWords(text, 5) || 'Claude Code')
}

async function sessionTitle() {
  return appTitle ?? (await ownTitle) ?? 'Claude Code'
}

function noteTitle(title: string | undefined) {
  if (title?.trim()) appTitle = oneLine(title, 80)
}

async function summarize($: EngineInterface, reason: string, answer: string) {
  if (reason === 'error') return 'Stopped: an API error ended the turn'
  if (reason === 'refusal') return 'Stopped: Claude declined this one'
  const line = await ask(
    $,
    `Below is a request and the assistant's final reply. In one line of at most 12 words, ` +
      `say what the user should know now. Start with "Done: " if the work is finished, or ` +
      `"Needs you: " if the reply asks the user something or waits on them. Reply with the line only.` +
      `\n\nRequest:\n${lastPrompt.slice(0, 1500)}\n\nReply:\n${answer.slice(-4000)}`,
    60,
  )
  return line ?? `Done: ${oneLine(answer.split(/(?<=[.!?])\s/)[0] || 'finished', 140)}`
}

async function locateNotifier($: EngineInterface) {
  for (const p of NOTIFIER_PATHS) if (await $.fs.exists(p).catch(() => false)) return p
  const r = await $.process.run(['/bin/sh', '-lc', 'command -v terminal-notifier']).catch(() => undefined)
  return r?.exitCode === 0 ? r.stdout.trim() || undefined : undefined
}

// The app to bring forward on click: macOS tells child processes which app
// launched them; terminals also say who they are in TERM_PROGRAM.
async function locateApp($: EngineInterface) {
  const bundle = await $.env.get('__CFBundleIdentifier')
  if (bundle) return bundle
  const term = await $.env.get('TERM_PROGRAM')
  return term ? TERMINAL_APPS[term] : undefined
}

// The project's name, shown small under the title. A worktree is named after
// the repository it belongs to, not after the worktree's own folder.
async function locateProject($: EngineInterface) {
  const root = await $.session.root().catch(() => '')
  const git = await $.process
    .run(['git', '-C', root || '.', 'rev-parse', '--path-format=absolute', '--git-common-dir'])
    .catch(() => undefined)
  const repo = git?.exitCode === 0 ? git.stdout.trim().replace(/\/\.git\/?$/, '') : ''
  return (repo || root).split('/').filter(Boolean).pop() ?? ''
}

async function hintOnce($: EngineInterface) {
  if (await $.store.get('notifierHintShown')) return
  await $.store.set('notifierHintShown', true)
  $.ui.toast('claude-pings: run `brew install terminal-notifier` to make notifications clickable', {
    timeoutMs: 12_000,
  })
}

async function notify($: EngineInterface, title: string, body: string, sound: string) {
  notifier ??= locateNotifier($)
  project ??= locateProject($)
  const [tn, subtitle] = await Promise.all([notifier, project])
  if (tn) {
    appId ??= locateApp($)
    const app = await appId
    const argv = [tn, '-title', title, '-subtitle', subtitle, '-message', body, '-sound', sound, '-group', group]
    const r = await $.process.run(app ? [...argv, '-activate', app] : argv).catch(() => undefined)
    if (r?.exitCode === 0) return
  }
  const script = [
    'on run argv',
    'display notification (item 2 of argv) with title (item 1 of argv) subtitle (item 4 of argv) sound name (item 3 of argv)',
    'end run',
  ]
  const r = await $.process
    .run(['osascript', ...script.flatMap(l => ['-e', l]), title, body, sound, subtitle])
    .catch(() => undefined)
  if (r?.exitCode !== 0) await $.process.run(['notify-send', title, subtitle ? `${subtitle} · ${body}` : body]).catch(() => undefined)
  if (!tn) await hintOnce($)
}

function clearPending() {
  pending?.timer?.cancel()
  pending = undefined
}

async function waitOnUser($: EngineInterface, tool: string, body: string) {
  clearPending()
  const p: Pending = { id: ++nextId, tool, title: await sessionTitle(), body }
  pending = p
  await notify($, p.title, p.body, cfg.attentionSound)
  if (cfg.remindMs > 0 && pending?.id === p.id) p.timer = $.clock.after(cfg.remindMs, () => remind($, p.id))
}

function remind($: EngineInterface, id: number) {
  if (pending?.id !== id) return
  void notify($, pending.title, `Still waiting · ${pending.body}`, cfg.attentionSound).catch(() => {})
}

async function notifyDone($: EngineInterface, reason: string, answer: string) {
  const title = await sessionTitle()
  const body = await summarize($, reason, answer)
  await notify($, title, body, /^Needs you/.test(body) ? cfg.attentionSound : cfg.doneSound)
}

function describePermission(tool: string, input: unknown) {
  const i = (input ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  const base = (p: string) => p.split('/').pop() || p
  if (tool === 'Bash') return `run ${str('command')}`
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit')
    return `edit ${base(str('file_path') || str('notebook_path'))}`
  if (tool === 'WebFetch') return `open ${str('url').replace(/^https?:\/\//, '')}`
  if (tool.startsWith('mcp__')) return `use ${tool.split('__').slice(1).join(' ')}`
  return `use ${tool}`
}

export const register: Register = (on, options) => {
  cfg.remindMs = Number(options.remindAfterMinutes ?? 5) * 60_000
  cfg.useAi = options.aiSummaries !== false
  cfg.doneSound = String(options.doneSound || 'Glass')
  cfg.attentionSound = String(options.attentionSound || 'Ping')

  on('turn.start', async ($, e, next) => {
    clearPending()
    if (e.text.trim()) {
      lastPrompt = e.text
      if (!appTitle && !ownTitle) ownTitle = nameSession($, e.text)
    }
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    noteTitle(e.session_title)
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    noteTitle(e.session_title)
    return next(e)
  })

  // Notifications are fired and forgotten: they never hold up the session.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion' && !e.agentId) {
      const q = (e.questions?.[0] ?? {}) as { question?: string }
      const body = `Question: ${oneLine(q.question ?? 'Claude has a question', 160)}`
      void waitOnUser($, e.tool, body).catch(() => {})
    }
    const result = await next(e)
    if (pending?.tool === e.tool) clearPending()
    return result
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    const body = `Needs OK: ${oneLine(describePermission(e.tool_name, e.tool_input), 160)}`
    void waitOnUser($, e.tool_name, body).catch(() => {})
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.isAborted) return result
    clearPending()
    void notifyDone($, e.reason, e.answer).catch(() => {})
    return result
  })
}
