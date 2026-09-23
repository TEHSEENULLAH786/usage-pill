# Usage Pill

A small pill that floats anywhere on your desktop, plus a menu bar item,
showing how much of your AI plans you've used: Claude Code's session and
weekly limits for every account you sign into, Ollama Cloud's included usage
in dollars, and any provider you add.

```
claude  Opus 1M  session 16%  week 45%  ↻ 34m  ·  ollama  pro  month $4.20  ↻ 14d
```

## Install

- **Mac app:** download the `.dmg` for your Mac from the
  [latest release](https://github.com/TEHSEENULLAH786/usage-pill/releases/latest)
  (`arm64` for Apple Silicon, `x64` for Intel) and drag Usage Pill to
  Applications. It isn't notarized, so macOS blocks the first launch:
  right-click it and choose Open, or open it once and then click **Open
  Anyway** under System Settings → Privacy & Security.
- **With Node:** `npx usage-pill` runs the same app. For the terminal command,
  `npx -p usage-pill usage-pill-cli` — `npx usage-pill-cli` on its own looks
  for a package by that name and won't find one, because the command lives
  inside `usage-pill`.

Claude needs no setup beyond being signed in to Claude Code on that Mac.
macOS asks once to allow reading that login from the Keychain.

## Using it

The pill drags anywhere and stays on top, across Spaces and over full-screen
apps. Click it for the detail panel: bars, reset times, the Claude Code model
picker, the layout switcher, appearance, per-model Ollama requests, and Quit.
The **×** — at the end of the pill, or in the top card's corner in the Card
layout — quits everything.

The menu bar item shows the headline percentages, plus a per-model weekly
limit such as Fable once it has been used, and holds the menu: show/hide the
pill, providers on/off, the Claude Code model, Appearance, Settings, launch at
login, quit.

**Appearance**, in Settings, in the panel's dropdown and in the menu bar's
Appearance menu: theme (match system, light, dark) and pill layout — numbers,
a circle per figure, a card (a column of rectangles, one per provider, each
limit a labelled bar with the time it resets), or a small card (the short name
and the percentages alone).

Settings live in `~/.config/usage-pill/settings.json`, shared with the CLI.

### Quit and uninstall

Quit from the **×** on the pill, the **Quit** button in the panel, or the menu
bar item. Any of the three closes the pill and the menu bar item together.
**Hide pill** keeps the menu bar item and removes the floating pill.

```sh
rm -rf ~/.config/usage-pill ~/.cache/usage-pill   # settings and cache
npm uninstall -g usage-pill                       # only if installed globally
```

Drag the app out of Applications to finish. If "Launch at login" was on, turn
it off first, or remove it under System Settings → General → Login Items.

## The CLI

Both commands come from the one package. Run it once with
`npx -p usage-pill usage-pill-cli`, or install it so the command is simply on
your PATH:

```sh
npm install -g usage-pill
```

```
usage-pill-cli                 print the pill
usage-pill-cli --json          the same as JSON
usage-pill-cli --tray          the short menu bar form (25% 44% 70%)
usage-pill-cli --refresh       skip the cache
usage-pill-cli --watch 60      reprint every minute, notify when a used limit resets
usage-pill-cli --provider claude
usage-pill-cli --set ollama.apiKey=…
usage-pill-cli --disable ollama
usage-pill-cli --accounts      Claude accounts known on this machine
usage-pill-cli --forget <uuid> drop a saved Claude account
```

As a Claude Code status line, in `~/.claude/settings.json`. This one needs the
global install above: a status line runs on every render, which is far too
often to go through npx.

```json
{ "statusLine": { "type": "command", "command": "usage-pill-cli --provider claude" } }
```

Numbers are cached in `~/.cache/usage-pill/cache.json` (3 min for Claude,
5 min for Ollama) so a status line that runs often doesn't hit the services.

## Providers

| provider | needs | on by default | reports |
|---|---|---|---|
| Claude | a Claude Code login on this machine | yes | session and weekly limits, model |
| Ollama | an API key from ollama.com → Settings → Keys | once a key is entered | included usage in dollars, requests per model |

A provider that needs a key stays off until it has one, so a fresh install
shows only Claude. Enter keys in the app's Settings, or with
`usage-pill-cli --set ollama.apiKey=…`.

**More than one Claude account.** Claude Code holds one login at a time. Each
time it runs, Usage Pill copies that login — the token into the Keychain, the
name into `~/.config/usage-pill/accounts.json` — so an account keeps its own
chip after you sign Claude Code into a different one. Nothing here signs
anybody in: every token was made by Claude Code itself. A copy stops updating
when it expires; sign Claude Code into that account once to refresh it.
`usage-pill-cli --accounts` lists them, `--forget <uuid>` drops one, and
Settings has a Forget button.

**No ChatGPT chip yet.** The Usage page in ChatGPT's own settings is served to
a logged-in browser session, not to the public API, so showing it needs an
OpenAI login stored on the machine the way Claude Code stores one. An OpenAI
API-spend provider exists in `src/core/providers/chatgpt.mjs` but is left out
of the shipped list, because spend is not the plan allowance the name
suggests.

### Writing one

A provider is a plain object. Return a `Snapshot`; the hub does caching,
back-off and "last good values while stale" for you. Drop the file in
`src/core/providers/` and add it to `providers()` in `src/core/index.mjs`. The
pill, panel, menu bar, settings form and CLI all render it with no further
code.

```js
export const gemini = {
  id: "gemini",
  label: "Gemini",
  ttlMs: 5 * 60_000,
  // Stay off until there is a key, so a fresh install isn't full of dead chips.
  enabledByDefault: (settings) => !!settings.apiKey,
  settings: [{ key: "apiKey", label: "API key", type: "password" }],
  async fetch({ settings }) {
    if (!settings.apiKey) return { available: false, reason: "Add an API key in Settings." };
    const data = await fetchSomething(settings.apiKey);
    return {
      available: true,
      badge: data.plan,
      meters: [
        {
          id: "month",
          label: "Monthly usage",
          short: "month",
          percent: data.percent,        // drives the bar and the ring
          display: data.dollars,        // optional: shown instead of the percentage
          total: data.allowance,        // optional: the panel reads "$4 of $60 used"
          resetsAt: data.resetsAt,
          headline: true,               // in the pill; `tray: true` is menu bar only
        },
      ],
    };
  },
};
```

Throw `new RateLimited(message, retryAfterMs)` when the service says to slow
down. `settings` fields build the app's Settings form automatically; `options`
(see the Claude provider's model picker) are choices the provider writes
somewhere else. Types are in `index.d.ts`.

## As a library

The same package is importable, so another tool can render the numbers its own
way.

```js
import { createHub, fileSettings, filePersist, providers, pillText } from "usage-pill";

// `providers` is a function, so a Claude account added later just appears.
const hub = createHub({ providers, settings: fileSettings(), persist: filePersist() });
const entries = await hub.getAll();        // [{ provider, snapshot }]
console.log(pillText(entries));
```

## Working on it

```sh
npm install
npm start            # the app: menu bar item + floating pill
npm run cli          # the same numbers as one line of text
npm test
```

```
assets/icon.png      the app icon, drawn by scripts/app-icon.mjs
assets/trayTemplate* the menu bar icon, drawn by scripts/tray-icon.mjs
src/main.mjs         Electron main process: windows, tray, IPC
src/preload.cjs      the only bridge the windows get
src/renderer/        pill, detail panel, settings window
src/core/            providers, hub, formatters, settings — no Electron
bin/                 usage-pill (launches the app), usage-pill-cli
```

`src/core` has no Electron in it, which is why the tests run in milliseconds
and why the CLI stays light.

## Shipping a release

The admin console's Deploy page has a **Usage Pill Mac app** task that runs all
of this. By hand:

```sh
npm run dist                  # dist/Usage Pill-<version>-{arm64,x64}.dmg
npm run release               # attaches both to a GitHub Release for this version
npm run release -- --dry-run  # check what it would publish, and that the login works
npm publish                   # optional: the npx route
```

`npm run release` re-runs safely: the same version updates its release and
replaces the installers. It refuses while commits are unpushed, since the
release would point at code nobody else has.

Each build is ad-hoc signed by `scripts/adhoc-sign.cjs`, which runs as
electron-builder's `afterPack` hook. Without it the bundle keeps the signature
Electron shipped with, our files break it, and macOS calls the download
*damaged and can't be opened* rather than merely unverified. Ad-hoc signing
doesn't make it trusted, only internally consistent, so a download still needs
allowing once. Removing the prompt altogether means a Developer ID and
notarization, which need a paid Apple Developer account.

## How it reads the numbers

- **Claude:** `api.anthropic.com/api/oauth/usage`, the endpoint Claude Code
  itself calls, with the login in the macOS Keychain
  (`~/.claude/.credentials.json` elsewhere). The token is used for that one
  request and never sent anywhere else.
- **Ollama:** `ollama.com/api/usage` with your API key. That endpoint returns
  only the share of the monthly included usage, rounded to two decimals, so
  the dollars are worked out from it (Pro includes $60) and can sit a few
  cents from ollama.com. It reports no reset date either, so the countdown
  runs to the day of the month the account was created; `resetDay` overrides
  it.

Both endpoints are undocumented by their owners and may change. When a service
refuses a check, the last good numbers stay on screen with a "not current"
note.
