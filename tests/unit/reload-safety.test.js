import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginTrackedMutation,
  isReloadSafe,
  reloadSafetyState,
  resetReloadSafetyForTests,
  setReloadBlocker,
  subscribeReloadSafety,
} from "../../src/shared/update/reloadSafety.js";

describe("reload safety", () => {
  beforeEach(() => resetReloadSafetyForTests());
  afterEach(() => resetReloadSafetyForTests());

  it("입력 blocker가 남아 있으면 갱신을 보류한다", () => {
    setReloadBlocker("feed:create", true);
    expect(isReloadSafe()).toBe(false);
    expect(reloadSafetyState()).toMatchObject({ blockerCount: 1, safe: false });

    setReloadBlocker("feed:create", false);
    expect(isReloadSafe()).toBe(true);
  });

  it("동시에 진행 중인 Mutation을 모두 종료할 때까지 보류한다", () => {
    const first = beginTrackedMutation();
    const second = beginTrackedMutation();
    expect(reloadSafetyState().activeMutations).toBe(2);

    first();
    first();
    expect(reloadSafetyState().activeMutations).toBe(1);
    second();
    expect(isReloadSafe()).toBe(true);
  });

  it("상태 변경을 구독자에게 알리고 해제 후에는 알리지 않는다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReloadSafety(listener);
    setReloadBlocker("profile", true);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    setReloadBlocker("profile", false);
    expect(listener).toHaveBeenCalledOnce();
  });
});
