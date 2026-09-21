# Usage Pill

A small pill that floats anywhere on your desktop, plus a menu bar item,
showing how much of your AI plans you've used: Claude Code's session and
weekly limits (every account you sign into), Ollama Cloud's month, OpenAI
spend, and any provider you add.

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
picker, appearance, per-model Ollama requests); the × on the pill quits
everything. The menu bar item shows the headline percentages, including a
per-model weekly limit such as Fable once it has been used, and holds the
menu: show/hide the pill, providers on/off, appearance, settings, launch at
login.

**Appearance** lives in the panel's dropdown and the menu bar's Appearance
menu: theme (match system / light / dark) and pill style (numbers, or a
circle per figure).

Settings are one file shared by the app and the CLI:
`~/.config/usage-pill/settings.json`.

## Quit and uninstall

Quit it from the **×** at the end of the pill, the **Quit** button in the
detail panel, or the menu bar item (**Quit Usage Pill**). Any of the three
closes the pill and the menu bar item together. **Hide pill** keeps the menu
bar item and removes the floating pill.

Nothing is installed system-wide. To remove every trace:

```sh
rm -rf ~/.config/usage-pill ~/.cache/usage-pill   # settings and cache
npm uninstall -g usage-pill usage-pill-core       # only if installed globally
```

If "Launch at login" was on, turn it off in the menu first (or under System
Settings → General → Login Items).

## Providers

| provider | needs | on by default |
|---|---|---|
| Claude | a Claude Code login on this machine | yes |
| Ollama | an API key from ollama.com → Settings → Keys | once a key is entered |
| OpenAI | an admin key from platform.openai.com | once a key is entered |

A provider that needs a key stays off until it has one, so a fresh install
shows only Claude. Enter keys in the app's Settings, or with
`usage-pill-cli --set ollama.apiKey=…`.

**More than one Claude account.** Claude Code holds one login at a time.
Each time it runs, Usage Pill copies that login — the token into the
Keychain, the name into `~/.config/usage-pill/accounts.json` — so an account
keeps its own chip after you sign Claude Code into a different one. Nothing
here signs anybody in: every token was made by Claude Code itself. A copy
stops updating when it expires; sign Claude Code into that account once to
refresh it. `usage-pill-cli --accounts` lists them, `--forget <uuid>` drops
one, and Settings has a Forget button.

**OpenAI is API spend, not ChatGPT.** OpenAI publishes no endpoint for a
ChatGPT plan's message allowance, so nothing can show it. What the provider
reports is organization API spend this month, against a budget you set.

Adding another (Gemini, Cursor, a company dashboard…) is a single file in
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
