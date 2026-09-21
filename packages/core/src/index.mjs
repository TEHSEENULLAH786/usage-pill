import { claudeProviders } from "./providers/claude.mjs";
import { chatgpt } from "./providers/chatgpt.mjs";
import { ollama } from "./providers/ollama.mjs";

export { claudeProvider, claudeProviders } from "./providers/claude.mjs";
export { chatgpt, ollama };

/**
 * Every provider that ships with the package, in display order.
 *
 * A function rather than an array because Claude contributes one provider per
 * account signed in to Claude Code on this machine. Pass it straight to
 * `createHub({ providers })`.
 *
 * `chatgpt` is deliberately not in this list. It reports OpenAI API spend,
 * which is not the ChatGPT plan allowance people expect from the name, and it
 * has never been checked against a live admin key. It is still exported, so
 * `createHub({ providers: async () => [...await claudeProviders(), ollama, chatgpt] })`
 * opts back in.
 */
export async function providers() {
  return [...(await claudeProviders()), ollama];
}

export { createHub, RateLimited } from "./hub.mjs";
export { fileSettings, filePersist, defaultSettingsPath, defaultCachePath } from "./settings.mjs";
export { watchResets } from "./notify.mjs";
export { readClaudeCredentials } from "./credentials.mjs";
export { claudeModel, claudeModelOptions, setClaudeModel } from "./claude-code.mjs";
export {
  accountLabel,
  claudeAccountToken,
  currentClaudeAccount,
  forgetClaudeAccount,
  listClaudeAccounts,
  rememberCurrentClaudeAccount,
} from "./claude-accounts.mjs";
export * from "./format.mjs";
