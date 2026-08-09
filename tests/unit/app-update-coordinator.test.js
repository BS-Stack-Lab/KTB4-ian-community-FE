import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_VERSION_CHANNEL,
  APP_VERSION_STORAGE_KEY,
  createAppUpdateCoordinator,
} from "../../src/shared/update/appUpdateCoordinator.js";
import {
  beginTrackedMutation,
  resetReloadSafetyForTests,
  setReloadBlocker,
} from "../../src/shared/update/reloadSafety.js";

const CURRENT_VERSION = "1111111111111111111111111111111111111111";
const NEXT_VERSION = "2222222222222222222222222222222222222222";

function manifestResponse(version = NEXT_VERSION) {
  return Promise.resolve({
    ok: true,
    json: async () => ({
      schemaVersion: 1,
      version,
      assets: { js: [], css: [] },
    }),
  });
}

function environment({ visibilityState = "visible", fetchObject } = {}) {
  const windowObject = new EventTarget();
  const documentObject = new EventTarget();
  Object.defineProperty(documentObject, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });
  documentObject.querySelector = vi.fn(() => ({
    getAttribute: () => CURRENT_VERSION,
  }));
  const posted = [];
  const channel = new EventTarget();
  channel.postMessage = vi.fn((message) => posted.push(message));
  channel.close = vi.fn();
  const reload = vi.fn();
  const fetchMock = fetchObject ?? vi.fn(() => manifestResponse());
  const coordinator = createAppUpdateCoordinator({
    documentObject,
    windowObject,
    fetchObject: fetchMock,
    reload,
    channelFactory: vi.fn((name) => {
      expect(name).toBe(APP_VERSION_CHANNEL);
      return channel;
    }),
  });
  return {
    channel,
    coordinator,
    documentObject,
    fetchMock,
    posted,
    reload,
    setVisibility(value) {
      visibilityState = value;
      documentObject.dispatchEvent(new Event("visibilitychange"));
    },
    windowObject,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("app update coordinator", () => {
  beforeEach(() => {
    resetReloadSafetyForTests();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => resetReloadSafetyForTests());

  it("최초 확인에서 새 버전을 발견하면 안전한 탭을 즉시 한 번 갱신한다", async () => {
    const env = environment();
    await flush();

    expect(env.fetchMock).toHaveBeenCalledWith("/version.json", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    expect(env.reload).toHaveBeenCalledOnce();
    expect(env.posted.at(-1)?.version).toBe(NEXT_VERSION);

    await env.coordinator.check({ immediate: true });
    expect(env.reload).toHaveBeenCalledOnce();
    env.coordinator.stop();
  });

  it("입력과 Mutation이 남아 있으면 보류하고 모두 해제된 뒤 갱신한다", async () => {
    setReloadBlocker("post:edit", true);
    const finishMutation = beginTrackedMutation();
    const env = environment();
    await flush();
    expect(env.reload).not.toHaveBeenCalled();

    setReloadBlocker("post:edit", false);
    expect(env.reload).not.toHaveBeenCalled();
    finishMutation();
    expect(env.reload).toHaveBeenCalledOnce();
    env.coordinator.stop();
  });

  it("BroadcastChannel과 storage fallback 버전을 자연스러운 이동 시 적용한다", async () => {
    const env = environment({
      fetchObject: vi.fn(() => manifestResponse(CURRENT_VERSION)),
    });
    await flush();

    env.channel.dispatchEvent(
      Object.assign(new Event("message"), {
        data: { type: "version-available", version: NEXT_VERSION },
      }),
    );
    expect(env.reload).not.toHaveBeenCalled();
    env.windowObject.dispatchEvent(new Event("app:navigation"));
    expect(env.reload).toHaveBeenCalledOnce();
    env.coordinator.stop();

    sessionStorage.clear();
    const fallback = environment({
      fetchObject: vi.fn(() => manifestResponse(CURRENT_VERSION)),
    });
    await flush();
    fallback.windowObject.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: APP_VERSION_STORAGE_KEY,
        newValue: JSON.stringify({
          type: "version-available",
          version: NEXT_VERSION,
        }),
      }),
    );
    fallback.setVisibility("hidden");
    expect(fallback.reload).toHaveBeenCalledOnce();
    fallback.coordinator.stop();
  });

  it("탭 복귀 시 재확인하고 오류·오프라인·동일 버전에서는 갱신하지 않는다", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: true }),
      })
      .mockImplementation(() => manifestResponse(CURRENT_VERSION));
    const env = environment({ fetchObject: fetchMock });
    await flush();
    expect(env.reload).not.toHaveBeenCalled();

    env.setVisibility("visible");
    await flush();
    env.setVisibility("visible");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(env.reload).not.toHaveBeenCalled();
    env.coordinator.stop();
  });
});
