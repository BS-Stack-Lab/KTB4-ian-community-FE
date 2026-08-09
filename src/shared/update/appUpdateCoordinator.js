import { isReloadSafe, subscribeReloadSafety } from "./reloadSafety.js";

export const APP_VERSION_CHANNEL = "pulse.app-version";
export const APP_VERSION_STORAGE_KEY = "pulse.app-version-event";
const RELOAD_ATTEMPT_KEY = "pulse.app-version.reload-attempt";

function currentVersion(documentObject) {
  return (
    documentObject
      ?.querySelector('meta[name="app-version"]')
      ?.getAttribute("content")
      ?.trim() || "local"
  );
}

function validManifest(value) {
  return Boolean(
    value &&
    value.schemaVersion === 1 &&
    typeof value.version === "string" &&
    value.version.length > 0,
  );
}

function storageValue(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorageValue(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Private browsing policies must not disable same-tab updates.
  }
}

function removeStorageValue(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Best-effort loop protection cleanup.
  }
}

export function createAppUpdateCoordinator({
  documentObject = globalThis.document,
  windowObject = globalThis,
  fetchObject = globalThis.fetch?.bind(globalThis),
  reload = () => globalThis.location?.reload(),
  channelFactory = (name) => new BroadcastChannel(name),
  sessionStorageObject = globalThis.sessionStorage,
  localStorageObject = globalThis.localStorage,
} = {}) {
  const runningVersion = currentVersion(documentObject);
  let pendingVersion = null;
  let reloading = false;
  let stopped = false;
  let channel = null;
  const removers = [];

  if (storageValue(sessionStorageObject, RELOAD_ATTEMPT_KEY) === runningVersion)
    removeStorageValue(sessionStorageObject, RELOAD_ATTEMPT_KEY);

  function publish(version) {
    const message = {
      type: "version-available",
      version,
      sentAt: Date.now(),
      nonce: Math.random(),
    };
    try {
      channel?.postMessage(message);
    } catch {
      // storage event remains available as a cross-tab fallback.
    }
    writeStorageValue(
      localStorageObject,
      APP_VERSION_STORAGE_KEY,
      JSON.stringify(message),
    );
  }

  function maybeReload() {
    if (
      stopped ||
      reloading ||
      !pendingVersion ||
      !isReloadSafe() ||
      storageValue(sessionStorageObject, RELOAD_ATTEMPT_KEY) === pendingVersion
    )
      return false;
    reloading = true;
    writeStorageValue(sessionStorageObject, RELOAD_ATTEMPT_KEY, pendingVersion);
    reload();
    return true;
  }

  function acceptVersion(
    version,
    { announce = false, immediate = false } = {},
  ) {
    if (!version || version === runningVersion) return false;
    pendingVersion = version;
    if (announce) publish(version);
    if (immediate || documentObject?.visibilityState === "hidden")
      maybeReload();
    return true;
  }

  async function check({ immediate = false } = {}) {
    if (stopped || typeof fetchObject !== "function") return false;
    try {
      const response = await fetchObject("/version.json", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return false;
      const manifest = await response.json();
      if (!validManifest(manifest)) return false;
      return acceptVersion(manifest.version, {
        announce: manifest.version !== runningVersion,
        immediate,
      });
    } catch {
      return false;
    }
  }

  function listen(target, type, listener) {
    target?.addEventListener?.(type, listener);
    removers.push(() => target?.removeEventListener?.(type, listener));
  }

  try {
    channel = channelFactory(APP_VERSION_CHANNEL);
    channel?.addEventListener?.("message", (event) => {
      if (event.data?.type === "version-available")
        acceptVersion(event.data.version);
    });
  } catch {
    channel = null;
  }

  listen(windowObject, "storage", (event) => {
    if (event.key !== APP_VERSION_STORAGE_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue);
      if (message.type === "version-available") acceptVersion(message.version);
    } catch {
      // Ignore malformed cross-tab events.
    }
  });
  listen(documentObject, "visibilitychange", () => {
    if (documentObject.visibilityState === "visible")
      check({ immediate: true });
    else maybeReload();
  });
  listen(windowObject, "pageshow", () => check({ immediate: true }));
  listen(windowObject, "popstate", () => maybeReload());
  listen(windowObject, "app:navigation", () => maybeReload());
  const unsubscribeSafety = subscribeReloadSafety(() => {
    if (pendingVersion && isReloadSafe()) maybeReload();
  });

  queueMicrotask(() => check({ immediate: true }));

  return {
    check,
    state: () => ({
      currentVersion: runningVersion,
      pendingVersion,
      reloading,
    }),
    stop() {
      stopped = true;
      unsubscribeSafety();
      removers.splice(0).forEach((remove) => remove());
      try {
        channel?.close?.();
      } catch {
        // Nothing else owns this channel.
      }
    },
  };
}

let coordinator;

export function startAppUpdateCoordinator() {
  coordinator ||= createAppUpdateCoordinator();
  return coordinator;
}
