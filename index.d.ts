/** One gauge a provider reports: a percentage of some allowance. */
export interface Meter {
  id: string;
  /** Full name for the detail view, e.g. "Current session". */
  label: string;
  /** One word for the pill, e.g. "session", "week", "month". */
  short: string;
  percent: number;
  severity?: string | null;
  resetsAt?: string | null;
  /** Shown in the pill and the menu bar (at most two per provider). */
  headline?: boolean;
  /** Also shown in the menu bar, where a per-model limit (Fable, Opus) has
   *  room. Ignored in the pill. */
  tray?: boolean;
  /** Replaces the percentage wherever the meter is read, for a figure that
   *  isn't one — a dollar amount, say. The bar still uses `percent`. */
  display?: string | null;
  /** What the figure is measured against, so a detail row can read
   *  "$4.20 of $60 used". Shown only in the panel, never in the pill. */
  total?: string | null;
  /** Heading the meter sits under in the detail view. */
  group?: string | null;
}

export interface Snapshot {
  available: boolean;
  /** Why there are no numbers, when `available` is false. */
  reason?: string;
  fetchedAt?: number;
  /** Short text after the provider name, e.g. the model or the plan. */
  badge?: string | null;
  account?: string | null;
  meters?: Meter[];
  rows?: { label: string; value: string }[];
  rowsTitle?: string;
  rowsEmpty?: string;
  notes?: string[];
  /** Last good numbers served while the service refuses new checks. */
  stale?: boolean;
  staleReason?: string;
}

export interface SettingField {
  key: string;
  label: string;
  type?: "text" | "password" | "number";
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
}

export interface OptionValue {
  value: string | null;
  label: string;
  note?: string;
}

/** A provider-side choice that writes somewhere else (Claude Code's model). */
export interface ProviderOption {
  key: string;
  label: string;
  help?: string;
  values(): OptionValue[] | Promise<OptionValue[]>;
  current(): string | null | Promise<string | null>;
  set(value: string | null): unknown;
}

export interface Provider {
  id: string;
  label: string;
  /** Short form for the pill, e.g. "claude" or "claude:work". Defaults to `id`. */
  short?: string;
  homepage?: string;
  /** Whether the provider is on when nothing has been ticked. `true` by
   *  default; a function receives the provider's saved settings, so one that
   *  needs an API key can stay off until it has one. */
  enabledByDefault?: boolean | ((settings: Record<string, any>) => boolean);
  /** Which account this provider reports on, when it is one of several. */
  account?: { uuid: string; email: string | null; name: string | null; current: boolean; expired: boolean } | null;
  /** How long a fetched snapshot is reused. Default 3 minutes. */
  ttlMs?: number;
  settings?: SettingField[];
  options?: ProviderOption[];
  fetch(ctx: { settings: Record<string, unknown>; previous: Snapshot | null }): Promise<Snapshot>;
}

export interface ProviderMeta {
  id: string;
  label: string;
  short: string;
  homepage: string | null;
  enabled: boolean;
  account: Provider["account"];
  settings: SettingField[];
  options: { key: string; label: string; help: string | null }[];
}

export interface Entry {
  provider: ProviderMeta;
  snapshot: Snapshot;
}

export interface SettingsStore {
  get(providerId: string): Record<string, any>;
  set?(providerId: string, patch: Record<string, unknown>): Record<string, any>;
}

export interface FileSettings extends SettingsStore {
  file: string;
  read(): any;
  set(providerId: string, patch: Record<string, unknown>): Record<string, any>;
  app(): Record<string, any>;
  setApp(patch: Record<string, unknown>): Record<string, any>;
}

export interface Persist {
  load(): Record<string, unknown>;
  save(state: Record<string, unknown>): void;
}

export interface Hub {
  /** The providers resolved by the last call; synchronous, for menus. */
  providers(): ProviderMeta[];
  /** Resolves the provider list again, picking up accounts added since. */
  reload(): Promise<ProviderMeta[]>;
  enabled(): ProviderMeta[];
  get(id: string, opts?: { refresh?: boolean }): Promise<Snapshot>;
  getAll(opts?: { refresh?: boolean }): Promise<Entry[]>;
  option(id: string, key: string): Promise<{ key: string; label: string; help: string | null; values: OptionValue[]; current: string | null }>;
  setOption(id: string, key: string, value: string | null): Promise<unknown>;
  /** Drops every cached snapshot, so the next read goes to the services. */
  invalidate(): void;
}

export interface ClaudeAccount {
  uuid: string;
  email: string | null;
  name: string | null;
  org: string | null;
  plan: string | null;
  /** Provider id: "claude" for the account Claude Code is signed in as. */
  id: string;
  current: boolean;
  token: string | null;
  expiresAt: number | null;
  expired: boolean;
  savedAt?: number | null;
}

export class RateLimited extends Error {
  constructor(message: string, retryAfterMs: number);
  retryAfterMs: number;
}

export const ollama: Provider;
export const chatgpt: Provider;
/** One Claude provider for the given account. */
export function claudeProvider(account: ClaudeAccount, opts: { alone: boolean }): Provider;
/** One Claude provider per account known to this machine. */
export function claudeProviders(): Promise<Provider[]>;
/** Every bundled provider: the Claude accounts, then Ollama, then OpenAI. */
export function providers(): Promise<Provider[]>;

export function createHub(init: {
  /** A fixed list, or a function re-resolved on every read for providers that
   *  come and go (one Claude provider per account). */
  providers: Provider[] | (() => Provider[] | Promise<Provider[]>);
  settings: SettingsStore;
  persist?: Persist | null;
  now?: () => number;
}): Hub;
export function fileSettings(file?: string): FileSettings;
export function filePersist(file?: string): Persist;
export function defaultSettingsPath(): string;
export function defaultCachePath(): string;
export function watchResets(init: { hub: Hub; notify: (title: string, message: string) => void; now?: () => number }): { update(entries: Entry[]): void; stop(): void };

export function readClaudeCredentials(): Promise<{ token: string; expiresAt: number | null } | null>;
export function currentClaudeAccount(): Omit<ClaudeAccount, "id" | "current" | "token" | "expired"> | null;
export function listClaudeAccounts(): Promise<ClaudeAccount[]>;
export function rememberCurrentClaudeAccount(): Promise<{ uuid: string; email: string | null } | null>;
export function claudeAccountToken(account: ClaudeAccount): Promise<string | null>;
export function forgetClaudeAccount(uuid: string): Promise<boolean>;
export function accountLabel(account: { email?: string | null; name?: string | null; uuid: string }): string;
export function claudeModel(): { id: string; label: string; longContext: boolean; short: string } | null;

export function shortReset(iso: string | null | undefined, now?: number): string;
export function resetLabel(iso: string | null | undefined, now?: number): string;
export function formatPercent(n: number): string;
export function level(meter: Meter): "ok" | "warn" | "danger";
/** What a meter reads as: its `display` when it has one, else the percentage. */
export function meterText(meter: Meter): string;
/** Headline meters plus any flagged for the menu bar. */
export function trayMeters(snapshot: Snapshot): Meter[];
export function headline(snapshot: Snapshot): Meter[];
export function updatedLabel(fetchedAt?: number, now?: number): string;
export function pillLine(entry: Entry, now?: number): string;
export function pillText(entries: Entry[], now?: number): string;
export function trayTitle(entries: Entry[]): string;
