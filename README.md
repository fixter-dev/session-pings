# session-pings: Claude Code notifications that say what Claude needs

A Claude Code mod that sends Mac notifications telling you **which session** needs you and **what** it needs: done, a question, or a permission to approve. Built for running several Claude Code sessions at once.

> **User activity and integration status · fixter-observability**
> Needs input: approve npm install stripe

Instead of "landing page finished", the title is the session's name (the same one the Claude app lists it under) and the project, and the message is a short status in the app's own words:

| When | The message says |
|---|---|
| Claude finished | `Done: pricing table stacks on mobile` (AI summary, at most 6 words) |
| Claude finished but is waiting on you | `Needs input: pick webhook retry plan` |
| Claude asks a question | `Needs input: Postgres or SQLite?` |
| Claude needs permission | `Needs input: approve npm install stripe` |
| Still unanswered after 5 minutes | `Still needs input: …` (once) |
| The turn failed | `Stopped: API error` |

Sessions without a project folder show only the session's name. Each session keeps one notification at a time: a newer one replaces its older one.

It stays quiet for turns you stopped yourself and for background helper agents. It only watches: it never blocks, changes or answers anything in your session.

Works in the Claude desktop app (Code tab) and in the terminal.

> **Status: v0.1.** Feedback welcome (see the end).

Why a mod instead of a `Stop` or `Notification` hook? A hook starts fresh every time; a mod stays running for the whole session, so it can pair your request with Claude's answer, tell "done" from "waiting on you", and cancel its reminder the moment you answer. The long version: [Claude Code notifications: why a mod beats a hook](https://fixter.dev/blog/claude-code-notifications-mod). New to mods? [Claude Code mods, explained simply](https://fixter.dev/blog/claude-code-mods-explained).

## Install

You need Claude Code 2.1.287 or newer, the version where mods are on by default. Check with `claude --version`.

**1. Add the plugin.** In a terminal:

```bash
claude plugin marketplace add fixter-dev/session-pings
```

```bash
claude plugin install session-pings@session-pings
```

**2. Make notifications clickable (recommended).** Without this, notifications still work, but clicking one does nothing useful. With it, a click opens that exact chat in the Claude app, or brings your terminal forward for terminal sessions:

```bash
brew install terminal-notifier
```

**3. Restart your sessions.** A running session only picks up new plugins when it starts.

- **Desktop app:** quit it fully (Cmd+Q) and reopen. All sessions come back with their history and load the mod. Wait until none is mid-task, since quitting interrupts a running turn.
- **Terminal:** exit and resume with `claude --continue` (latest session) or `claude --resume` (pick one).

**4. Allow notifications.** The first notification may make macOS ask whether to allow notifications from terminal-notifier (or Script Editor, without step 2). Allow it. Then in System Settings → Notifications → **terminal-notifier**, set the alert style to **Persistent** (called **Alerts** on older macOS), so notifications stay until you dismiss them instead of vanishing after ~5 seconds.

**5. Turn off old notification hooks.** If you already had `Stop` / `Notification` hooks in `~/.claude/settings.json` that show notifications, remove them, or you'll get two of everything.

## Check it works

In any session, ask Claude: *"Ask me a test question with AskUserQuestion."* A notification titled with the session's name should say `Needs input: …`. When you answer and the turn ends, a `Done: …` notification follows a second or two later.

## Settings

All optional. Change them in Claude Code's config menu under **session-pings**, or in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "session-pings": {
      "options": {
        "remindAfterMinutes": 5,
        "aiSummaries": true,
        "doneSound": "Glass",
        "attentionSound": "Ping"
      }
    }
  }
}
```

| Setting | Default | What it does |
|---|---|---|
| `remindAfterMinutes` | `5` | Remind once if a question or permission is still unanswered. `0` turns reminders off. |
| `aiSummaries` | `true` | Uses Haiku on your own Claude Code login for the one-line summary (and a session name when the app has none yet). A tiny bit of usage per notification. Off: uses the first sentence of Claude's reply. |
| `doneSound` | `Glass` | macOS sound when Claude is done. |
| `attentionSound` | `Ping` | macOS sound for questions, permissions and reminders. |

Sound names: Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink.

## Troubleshooting

- **No notifications at all.** Did you restart the session after installing? Check `claude plugin list` shows `session-pings` enabled. Check macOS Focus / Do Not Disturb, and the app's notification permission in System Settings.
- **Notifications vanish after a few seconds.** That's macOS's Temporary/Banners style; set **Persistent** (step 4). Missed ones are in Notification Center (click the clock in the menu bar).
- **Clicking opens Script Editor.** terminal-notifier isn't installed or isn't found; run step 2.
- **Title is "Claude Code" or looks odd.** The session has no name in the app yet; the mod names it from your first message and keeps that name.
- **Still stuck.** Start Claude Code with `claude --debug` and look for lines starting with `session-pings:`; send them along with your feedback.

## Uninstall

```bash
claude plugin uninstall session-pings@session-pings
```

## Feedback

Open an issue in this repo:

- Did the notifications arrive when you expected? Any you missed, or ones you didn't want?
- Is the session name enough to know which work it's about?
- Is the one-line message useful, too long, or wrong?
- Desktop app, terminal, or both? Which terminal app?

## How it works

session-pings is a Claude Code mod: a plugin whose behaviour lives in one module, [`plugins/session-pings/hooks/register.ts`](plugins/session-pings/hooks/register.ts). It listens for a turn ending, `AskUserQuestion`, and permission requests, reads the session title, and shows the notification with `terminal-notifier` (falling back to macOS's built-in `osascript`, and `notify-send` on Linux).

---

Made by [Fixter](https://fixter.dev), monitoring for teams that build with coding agents.
