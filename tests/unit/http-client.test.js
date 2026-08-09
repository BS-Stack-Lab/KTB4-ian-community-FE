import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  httpClient,
  resetHttpClientForTests,
} from "../../src/shared/api/httpClient.js";
import {
  reloadSafetyState,
  resetReloadSafetyForTests,
} from "../../src/shared/update/reloadSafety.js";

const response = (status, body = null) =>
  new Response(body && JSON.stringify(body), {
    status,
    headers: body ? { "content-type": "application/json" } : {},
  });

describe("React HTTP Client", () => {
  beforeEach(() => {
    resetHttpClientForTests();
    resetReloadSafetyForTests();
    document.cookie = "XSRF-TOKEN=test; Path=/";
    globalThis.__API_BASE_URL__ = "http://api.test";
    globalThis.fetch = vi.fn();
  });

  it("동시 만료 요청에서 refresh를 한 번만 실행한다", async () => {
    const calls = new Map();
    fetch.mockImplementation(async (url) => {
      const path = new URL(url).pathname;
      calls.set(path, (calls.get(path) || 0) + 1);
      if (path === "/api/users/refresh")
        return response(200, {
          accessTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
      if (calls.get(path) === 1)
        return response(401, { message: "expired_access_token" });
      return response(200, { data: { ok: true } });
    });
    await expect(
      Promise.all([httpClient("/api/posts"), httpClient("/api/users/1")]),
    ).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(calls.get("/api/users/refresh")).toBe(1);
  });

  it("일반 401은 refresh하지 않는다", async () => {
    fetch.mockResolvedValue(response(401, { message: "unauthorized" }));
    await expect(httpClient("/api/posts")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("204 응답을 null로 반환한다", async () => {
    fetch.mockResolvedValue(response(204));
    await expect(httpClient("/api/users/logout")).resolves.toBeNull();
  });

  it("FormData에는 Content-Type을 직접 설정하지 않는다", async () => {
    fetch.mockResolvedValue(response(204));
    await httpClient("/api/posts/1", { method: "POST", body: new FormData() });
    expect(fetch.mock.calls.at(-1)[1].headers.has("Content-Type")).toBe(false);
  });

  it("CSRF 쿠키가 요청 직전에 갱신되면 최신 토큰을 헤더에 사용한다", async () => {
    const cookie = vi
      .spyOn(document, "cookie", "get")
      .mockReturnValueOnce("XSRF-TOKEN=before-refresh")
      .mockReturnValue("XSRF-TOKEN=after-refresh");
    fetch.mockImplementation(async (_url, options) => {
      const cookieToken = document.cookie.split("=").at(-1);
      const headerToken = options.headers.get("X-XSRF-TOKEN");
      return headerToken === cookieToken
        ? response(204)
        : response(403, { code: "INVALID_CSRF_TOKEN" });
    });

    await expect(
      httpClient("/api/posts", { method: "POST" }),
    ).resolves.toBeNull();
    expect(fetch.mock.calls.at(-1)[1].headers.get("X-XSRF-TOKEN")).toBe(
      "after-refresh",
    );
    cookie.mockRestore();
  });

  it("AbortError를 API Error로 바꾸지 않는다", async () => {
    sessionStorage.setItem("community.user", "{}");
    sessionStorage.setItem("userId", "1");
    history.replaceState({}, "", "/feed");
    const error = new DOMException("aborted", "AbortError");
    fetch.mockRejectedValue(error);
    await expect(httpClient("/api/posts")).rejects.toBe(error);
    expect(sessionStorage.getItem("community.user")).toBe("{}");
    expect(location.pathname).toBe("/feed");
  });

  it("Mutation 응답을 받을 때까지 자동 갱신을 차단한다", async () => {
    let resolveRequest;
    fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const request = httpClient("/api/posts", {
      method: "POST",
      body: JSON.stringify({ content: "작업 중" }),
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(reloadSafetyState()).toMatchObject({
      activeMutations: 1,
      safe: false,
    });

    resolveRequest(response(204));
    await expect(request).resolves.toBeNull();
    expect(reloadSafetyState()).toMatchObject({
      activeMutations: 0,
      safe: true,
    });
  });
});
