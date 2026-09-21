import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** ~/.config/usage-pill/settings.json, shared by the CLI and the app. */
export function defaultSettingsPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "usage-pill", "settings.json");
}

/** ~/.cache/usage-pill/cache.json: last numbers, so short runs don't re-fetch. */
export function defaultCachePath() {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(base, "usage-pill", "cache.json");
}

/**
 * Settings on disk:
 *   { "providers": { "<id>": { "enabled": true, ...provider fields } }, "app": { ... } }
 * `get(id)` / `set(id, patch)` are per provider; `app()` / `setApp(patch)`
 * belong to whichever front end is running.
 */
export function fileSettings(file = defaultSettingsPath()) {
  const read = () => {
    try {
      return JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      return {};
    }
  };
  const write = (data) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  };
  return {
    file,
    read,
    get: (id) => read().providers?.[id] ?? {},
    set(id, patch) {
      const data = read();
      data.providers = { ...(data.providers ?? {}), [id]: { ...(data.providers?.[id] ?? {}), ...patch } };
      write(data);
      return data.providers[id];
    },
    app: () => read().app ?? {},
    setApp(patch) {
      const data = read();
      data.app = { ...(data.app ?? {}), ...patch };
      write(data);
      return data.app;
    },
  };
}

/** `{ load, save }` for `createHub({ persist })`, backed by a JSON file. */
export function filePersist(file = defaultCachePath()) {
  return {
    load() {
      try {
        return JSON.parse(readFileSync(file, "utf-8"));
      } catch {
        return {};
      }
    },
    save(state) {
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(state));
      } catch {
        // A cache that can't be written is only a cache.
      }
    },
  };
}
