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
  homepage?: string;
  /** How long a fetched snapshot is reused. Default 3 minutes. */
  ttlMs?: number;
  settings?: SettingField[];
  options?: ProviderOption[];
  fetch(ctx: { settings: Record<string, unknown>; previous: Snapshot | null }): Promise<Snapshot>;
}

export interface ProviderMeta {
  id: string;
  label: string;
  homepage: string | null;
  enabled: boolean;
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
  providers(): ProviderMeta[];
  enabled(): ProviderMeta[];
  get(id: string, opts?: { refresh?: boolean }): Promise<Snapshot>;
  getAll(opts?: { refresh?: boolean }): Promise<Entry[]>;
  option(id: string, key: string): Promise<{ key: string; label: string; help: string | null; values: OptionValue[]; current: string | null }>;
  setOption(id: string, key: string, value: string | null): Promise<unknown>;
}

export class RateLimited extends Error {
  constructor(message: string, retryAfterMs: number);
  retryAfterMs: number;
}

export const claude: Provider;
export const ollama: Provider;
export const providers: Provider[];

export function createHub(init: { providers: Provider[]; settings: SettingsStore; persist?: Persist | null; now?: () => number }): Hub;
export function fileSettings(file?: string): FileSettings;
export function filePersist(file?: string): Persist;
export function defaultSettingsPath(): string;
export function defaultCachePath(): string;
export function watchResets(init: { hub: Hub; notify: (title: string, message: string) => void; now?: () => number }): { update(entries: Entry[]): void; stop(): void };

export function readClaudeCredentials(): Promise<{ token: string; expiresAt: number | null } | null>;
export function claudeModel(): { id: string; label: string; longContext: boolean; short: string } | null;
export function claudeModelOptions(): OptionValue[];
export function setClaudeModel(value: string | null): ReturnType<typeof claudeModel>;

export function shortReset(iso: string | null | undefined, now?: number): string;
export function resetLabel(iso: string | null | undefined, now?: number): string;
export function formatPercent(n: number): string;
export function level(meter: Meter): "ok" | "warn" | "danger";
export function headline(snapshot: Snapshot): Meter[];
export function updatedLabel(fetchedAt?: number, now?: number): string;
export function pillLine(entry: Entry, now?: number): string;
export function pillText(entries: Entry[], now?: number): string;
export function trayTitle(entries: Entry[]): string;
