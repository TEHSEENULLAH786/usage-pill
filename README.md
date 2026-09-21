# Usage Pill

A small pill that floats anywhere on your desktop, plus a menu bar item,
showing how much of your AI plans you've used: Claude Code's session and
weekly limits, Ollama Cloud's month, and any provider you add.

```
claude  Fable 1M  session 25%  week 39%  ↻ 3h 18m  ·  ollama  month 6.2%  ↻ 9d
```

Two packages, one codebase:

| package                              | what                                                   |
|--------------------------------------|--------------------------------------------------------|
| [`packages/core`](packages/core)     | `usage-pill-core` on npm: the providers, the hub, the CLI (`usage-pill-cli`) |
| [`packages/app`](packages/app)       | `usage-pill` on npm: the Electron menu bar app with the floating pill |

## Install

- **Mac app:** download the `.dmg` from the [latest release](https://github.com/TEHSEENULLAH786/usage-pill/releases/latest)
  and drag Usage Pill to Applications. It isn't notarized yet, so right-click
  and choose Open on the first launch.
- **From npm:** `npx usage-pill` runs the same app; `npx usage-pill-cli`
  prints the numbers in a terminal.
- **In Claude Code:** see [packages/core/README.md](packages/core/README.md#cli)
  for the status line one-liner.

## Run it from source

```sh
npm install
npm start            # the app: menu bar item + floating pill
npm run cli          # the same numbers as one line of text
npm test
```

The pill drags anywhere and stays on top, across Spaces and over full-screen
apps. Click it for the detail panel (bars, reset times, the Claude Code model
picker, per-model Ollama requests). The menu bar item shows the headline
percentages and has the menu: show/hide the pill, providers on/off, settings,
launch at login.

Settings are one file shared by the app and the CLI:
`~/.config/usage-pill/settings.json`.

## Quit and uninstall

The pill has no close button: it's a menu bar app. Quit it from the menu bar
item (**Quit Usage Pill**) or from the Quit button in the detail panel.
**Hide pill** keeps the menu bar item and removes the floating pill.

Nothing is installed system-wide. To remove every trace:

```sh
rm -rf ~/.config/usage-pill ~/.cache/usage-pill   # settings and cache
npm uninstall -g usage-pill usage-pill-core       # only if installed globally
```

If "Launch at login" was on, turn it off in the menu first (or under System
Settings → General → Login Items).

## Providers

Claude works with no setup, from the Claude Code login on this machine.
Ollama needs an API key from ollama.com → Settings → Keys, entered in the
app's Settings or with `usage-pill-cli --set ollama.apiKey=…`.

Adding one (ChatGPT, Gemini, Cursor…) is a single file in
`packages/core/src/providers/` that returns a `Snapshot`; the pill, panel,
menu, settings form and CLI all render it without further code. See
[packages/core/README.md](packages/core/README.md#writing-one).

## Ship it

```sh
# npm: the core + CLI, then the app (needs `electron` as a peer dependency)
cd packages/core && npm publish
cd packages/app  && npm publish
npx usage-pill                # anyone with Node gets the menu bar app

# macOS .dmg for everyone else
npm run dist                  # packages/app/dist/Usage Pill-*.dmg
```

The dmg is unsigned until you add an Apple Developer identity to
`packages/app/electron-builder.yml`; unsigned builds open with right-click →
Open, or through a Homebrew cask.

## How it reads the numbers

- Claude: the endpoint Claude Code itself calls (`api.anthropic.com/api/oauth/usage`),
  with the login stored in the macOS Keychain. macOS may ask once to allow
  the read. The token is never stored or sent anywhere else.
- Ollama: `ollama.com/api/usage` with your API key.

Both endpoints are undocumented by their owners. When a service refuses a
check, the last good numbers stay on screen with a "not current" note.
