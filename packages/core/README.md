# usage-pill-core

Your AI plan usage as one small line: Claude Code's session and weekly limits
for every account you sign into, Ollama Cloud's included usage in dollars, and
whatever provider you add next.

```
$ npx usage-pill-cli
claude  Opus 1M  session 16%  week 45%  ↻ 34m  ·  ollama  pro  month $4.20  ↻ 14d
```

The desktop pill and menu bar app that renders the same numbers is
[`usage-pill`](https://www.npmjs.com/package/usage-pill).

## CLI

```
usage-pill-cli                 print the pill
usage-pill-cli --json          the same as JSON
usage-pill-cli --refresh       skip the cache
usage-pill-cli --watch 60      reprint every minute, notify when a used limit resets
usage-pill-cli --tray          the short menu bar form (25% 44% 70%)
usage-pill-cli --provider claude
usage-pill-cli --set ollama.apiKey=…
usage-pill-cli --disable ollama
usage-pill-cli --accounts      Claude accounts known on this machine
usage-pill-cli --forget <uuid> drop a saved Claude account
```

As a Claude Code status line, in `~/.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": "usage-pill-cli --provider claude" } }
```

Numbers are cached in `~/.cache/usage-pill/cache.json` (3 min for Claude,
5 min for Ollama) so a status line that runs often doesn't hit the services.

## Library

```js
import { createHub, fileSettings, filePersist, providers, pillText } from "usage-pill-core";

// `providers` is a function, so a Claude account added later just appears.
const hub = createHub({ providers, settings: fileSettings(), persist: filePersist() });
const entries = await hub.getAll();        // [{ provider, snapshot }]
console.log(pillText(entries));
```

## Providers

| id        | needs                                    | reports                                     |
|-----------|------------------------------------------|---------------------------------------------|
| `claude`  | a Claude Code login on this machine      | current session and weekly limits, model    |
| `claude:…`| a login copied when it was current       | the same, for another account                |
| `ollama`  | `apiKey` setting or `OLLAMA_API_KEY`     | included usage in dollars, requests per model |

`chatgpt` is written but not shipped in `providers()`: it reports OpenAI API
spend rather than the ChatGPT plan allowance the name suggests, and it has
never been run against a live admin key. Import it by name to opt in.

`providers()` is a function, not an array: Claude contributes one provider per
account signed in to Claude Code on this machine (see `listClaudeAccounts()`).
Pass it straight to `createHub({ providers })`, which re-resolves it on every
read so an account added later simply appears.

A provider may set `enabledByDefault` to stay off until it is configured;
`ollama` and `chatgpt` both wait for a key.

### Writing one

A provider is a plain object. Return a `Snapshot`; the hub does caching,
back-off and "last good values while stale" for you.

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
down. `settings` fields drive the app's Settings window automatically;
`options` (see the Claude provider's model picker) are choices the provider
writes somewhere else. Types are in `index.d.ts`.

## Where the numbers come from

- Claude: `api.anthropic.com/api/oauth/usage`, the endpoint Claude Code itself
  uses, called with the login in the macOS Keychain
  (`~/.claude/.credentials.json` elsewhere). The first read may show a macOS
  Keychain prompt. Claude Code holds one login at a time, so each run copies
  the current one — token to the Keychain under `usage-pill-claude`, name to
  `~/.config/usage-pill/accounts.json` — and every account keeps its own chip.
  Nothing here signs anybody in, and a copy stops working when it expires.
- Ollama: `ollama.com/api/usage` with your API key. That endpoint returns
  only the share of the monthly included usage, rounded to two decimals, so
  the dollars are worked out from it (Pro includes $60) and can sit a few
  cents from ollama.com. It reports no reset date either, so the countdown
  runs to the day of the month the account was created; `resetDay` overrides
  it.

Both are undocumented by their owners and may change.
