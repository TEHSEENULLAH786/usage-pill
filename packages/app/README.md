# usage-pill

A floating desktop pill and menu bar item with your AI plan usage: Claude
Code's session and weekly limits, Ollama Cloud's monthly usage, and more via
[`usage-pill-core`](https://www.npmjs.com/package/usage-pill-core) providers.

```sh
npx usage-pill            # starts the menu bar app (installs Electron once)
npx usage-pill --detach   # and returns to the shell
```

- Drag the pill anywhere; it stays on top, on every Space and over
  full-screen apps. Its spot is remembered.
- Click it for the detail panel: bars, reset times, the Claude Code model
  picker, Ollama requests per model, Refresh, Settings.
- The menu bar item shows the headline percentages and holds the menu:
  show/hide the pill, providers on/off, Settings, launch at login, quit.
- A notification fires when a limit you'd used resets to 0%.

Settings live in `~/.config/usage-pill/settings.json`, shared with the CLI.

## Build a .dmg

```sh
npm run dist
```

See the repository README for signing.
