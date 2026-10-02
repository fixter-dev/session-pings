# claude-pings

Mac notifications for Claude Code that tell you **which session** needs you and **what** it needs.

> **User activity and integration status**
> fixter-observability
> Needs OK: run npm install stripe

Instead of "landing page finished", you get the session's name (the same one the Claude app lists it under), the project in small text beneath it, and one line saying what happened:

| When | The line says |
|---|---|
| Claude finished | `Done: pricing table now stacks on mobile` (a one-line AI summary) |
| Claude finished but is waiting on you | `Needs you: pick a plan for the webhook retries` |
| Claude asks a question | `Question: Postgres or SQLite?` |
| Claude needs permission | `Needs OK: run npm install stripe` |
| Still unanswered after 5 minutes | `Still waiting · …` (once) |

It stays quiet for turns you stopped yourself and for background helper agents. It only watches: it never blocks, changes or answers anything in your session.

Works in the Claude desktop app (Code tab) and in the terminal.

> **Status: team test (v0.1).** Please try it for a few days and send feedback (see the end).

## Install

You need Claude Code 2.1.286 or newer (mods support) and access to this repo.

**1. Add the plugin.** In a terminal:

```bash
claude plugin marketplace add fixter-dev/claude-pings
```

```bash
claude plugin install claude-pings@claude-pings
```

**2. Make notifications clickable (recommended).** Without this, notifications still work, but clicking one does nothing useful. With it, a click brings you back to the app you were using (the Claude app or your terminal):

```bash
brew install terminal-notifier
```

**3. Restart your sessions.** A running session only picks up new plugins when it starts.

- **Desktop app:** quit it fully (Cmd+Q) and reopen. All sessions come back with their history and load the mod. Wait until none is mid-task, since quitting interrupts a running turn.
- **Terminal:** exit and resume with `claude --continue` (latest session) or `claude --resume` (pick one).

**4. Allow notifications.** The first notification may make macOS ask whether to allow notifications from terminal-notifier (or Script Editor, without step 2). Allow it, and in System Settings → Notifications set the style to **Banners** or **Alerts**.

**5. Turn off old notification hooks.** If you already had `Stop` / `Notification` hooks in `~/.claude/settings.json` that show notifications, remove them, or you'll get two of everything.

## Check it works

In any session, ask Claude: *"Ask me a test question with AskUserQuestion."* A notification titled with the session's name should say `Question: …`. When you answer and the turn ends, a `Done: …` notification follows a second or two later.

## Settings

All optional. Change them in Claude Code's config menu under **claude-pings**, or in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "claude-pings": {
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

- **No notifications at all.** Did you restart the session after installing? Check `claude plugin list` shows `claude-pings` enabled. Check macOS Focus / Do Not Disturb, and the app's notification permission in System Settings.
- **Clicking opens Script Editor.** terminal-notifier isn't installed or isn't found; run step 2.
- **Title is "Claude Code" or looks odd.** The session has no name in the app yet; the mod names it from your first message and keeps that name.
- **Still stuck.** Start Claude Code with `claude --debug` and look for lines starting with `claude-pings:`; send them along with your feedback.

## Uninstall

```bash
claude plugin uninstall claude-pings@claude-pings
```

## Feedback

Tell Kristina (or open an issue in this repo):

- Did the notifications arrive when you expected? Any you missed, or ones you didn't want?
- Is the session name enough to know which work it's about?
- Is the one-line message useful, too long, or wrong?
- Desktop app, terminal, or both? Which terminal app?

## How it works

claude-pings is a Claude Code mod: a plugin whose behaviour lives in one module, [`plugins/claude-pings/hooks/register.ts`](plugins/claude-pings/hooks/register.ts). It listens for a turn ending, `AskUserQuestion`, and permission requests, reads the session title, and shows the notification with `terminal-notifier` (falling back to macOS's built-in `osascript`, and `notify-send` on Linux).
