import { ApiError } from "./apiError.js";
import { errorMessageFor } from "./errorMessages.js";
import { apiBaseUrl } from "../config/env.js";
import { beginTrackedMutation } from "../update/reloadSafety.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const NO_REFRESH_PATHS = new Set([
  "/api/csrf",
  "/api/users/login",
  "/api/users/signup",
  "/api/users/logout",
  "/api/users/refresh",
]);
const TERMINAL_REFRESH_CODES = new Set([
  "REFRESH_TOKEN_NOT_FOUND",
  "INVALID_REFRESH_TOKEN",
  "EXPIRED_REFRESH_TOKEN",
  "REFRESH_TOKEN_REUSED",
  "REFRESH_TOKEN_USER_MISMATCH",
  "REFRESH_TOKEN_FAMILY_MISMATCH",
  "USER_NOT_FOUND",
  "USER_ALREADY_DELETED",
]);
const EXPIRY_STORAGE_KEY = "community.accessTokenExpiresAt";
const RETRY_STORAGE_KEY = "community.accessTokenRefreshRetry";
const AUTH_EVENT_STORAGE_KEY = "community.authEvent";
const REFRESH_CHANNEL_NAME = "community.auth";
const REFRESH_LOCK_NAME = "community.auth.refresh";
const REFRESH_WINDOW_MS = 60_000;
const TRANSIENT_RETRY_MS = 10_000;
const RETRY_DEFERRED_CODE = "REFRESH_RETRY_SCHEDULED";

let refreshPromise = null;
let refreshTimer = null;
let retryTimer = null;
let redirecting = false;
let sessionFailureHandled = false;
let accessTokenExpiresAt = null;
let authChannel = null;

function readCookie(name) {
  return (
    document.cookie
      .split("; ")
      .find((item) => item.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}

function localStorageValue(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setLocalStorageValue(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // 공유 저장소를 사용할 수 없어도 현재 탭의 갱신은 계속한다.
  }
}

function removeLocalStorageValue(key) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // 공유 저장소를 사용할 수 없어도 현재 탭의 정리는 계속한다.
  }
}

function parseStoredJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function validExpiry(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function readSharedExpiry() {
  const value = localStorageValue(EXPIRY_STORAGE_KEY);
  return validExpiry(value) ? value : null;
}

function readRetryState() {
  const value = parseStoredJson(localStorageValue(RETRY_STORAGE_KEY));
  if (!value || typeof value !== "object") return null;
  return value;
}

function writeRetryState(value) {
  if (!value) {
    removeLocalStorageValue(RETRY_STORAGE_KEY);
    return;
  }
  setLocalStorageValue(RETRY_STORAGE_KEY, JSON.stringify(value));
  publishMessage({ type: "refresh-retry", state: value });
}

function normalizeCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function isTerminalRefreshFailure(cause) {
  return TERMINAL_REFRESH_CODES.has(normalizeCode(cause?.code));
}

function isAbortError(cause) {
  return cause?.name === "AbortError";
}

function isDeferredRetry(cause) {
  return normalizeCode(cause?.code) === RETRY_DEFERRED_CODE;
}

async function parse(response) {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return response.text();
  try {
    return await response.json();
  } catch (cause) {
    throw new ApiError("서버 응답을 해석할 수 없습니다.", {
      status: response.status,
      response,
      cause,
    });
  }
}

function toApiError(response, body) {
  const code = body?.code ?? body?.errorCode;
  const serverMessage =
    typeof body === "string" ? body : (body?.message ?? undefined);
  return new ApiError(errorMessageFor(code, serverMessage), {
    status: response.status,
    code,
    fieldErrors: body?.fieldErrors,
    response,
    serverMessage,
  });
}

function csrfToken() {
  const token = readCookie("XSRF-TOKEN");
  if (!token) throw new ApiError("XSRF-TOKEN 쿠키를 확인할 수 없습니다.");
  return decodeURIComponent(token);
}

async function ensureCsrfCookie(signal) {
  if (readCookie("XSRF-TOKEN")) return;
  const response = await fetch(`${apiBaseUrl()}/api/csrf`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) throw toApiError(response, await parse(response));
  if (!readCookie("XSRF-TOKEN"))
    throw new ApiError("XSRF-TOKEN 쿠키를 확인할 수 없습니다.");
}

async function send(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const releaseMutation = UNSAFE_METHODS.has(method)
    ? beginTrackedMutation()
    : () => {};
  const headers = new Headers(options.headers || {});
  try {
    if (options.body && !(options.body instanceof FormData)) {
      if (!headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
    }
    if (UNSAFE_METHODS.has(method)) {
      await ensureCsrfCookie(options.signal);
      // 쿠키를 읽은 뒤 비동기 경계를 두지 않고 요청을 시작해야, 다른 응답이
      // 토큰 쿠키를 갱신해 헤더와 쿠키가 불일치하는 경쟁 조건을 피할 수 있다.
      headers.set("X-XSRF-TOKEN", csrfToken());
    }
    const { __retried, ...fetchOptions } = options;
    return await fetch(`${apiBaseUrl()}${path}`, {
      ...fetchOptions,
      method,
      headers,
      credentials: "include",
    });
  } finally {
    releaseMutation();
  }
}

function expiryValue(value) {
  return value?.accessTokenExpiresAt ?? value?.access_token_expires_at ?? null;
}

function tabHasAuthenticatedSession() {
  try {
    return Boolean(
      globalThis.sessionStorage?.getItem("community.user") ||
      globalThis.sessionStorage?.getItem("userId"),
    );
  } catch {
    return false;
  }
}

function expiringSoon(value = accessTokenExpiresAt) {
  return Boolean(
    validExpiry(value) && Date.parse(value) - Date.now() <= REFRESH_WINDOW_MS,
  );
}

function clearRefreshTimer() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

function clearRetryTimer() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRefreshTimer(value) {
  clearRefreshTimer();
  if (!validExpiry(value)) return;
  const delay = Math.max(Date.parse(value) - Date.now() - REFRESH_WINDOW_MS, 0);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    executeRefresh({ trigger: "timer" }).catch(() => {});
  }, delay);
}

function scheduleRetryTimer(state) {
  clearRefreshTimer();
  clearRetryTimer();
  if (!state?.retryAt || state.exhausted) return;
  const delay = Math.max(Number(state.retryAt) - Date.now(), 0);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    executeRefresh({ force: true, trigger: "retry" }).catch(() => {});
  }, delay);
}

function applyAccessTokenExpiresAt(
  value,
  { persist = false, publish = false, schedule = true } = {},
) {
  if (!validExpiry(value)) return false;
  accessTokenExpiresAt = value;
  redirecting = false;
  sessionFailureHandled = false;
  clearRetryTimer();
  if (persist) {
    setLocalStorageValue(EXPIRY_STORAGE_KEY, value);
    writeRetryState(null);
  }
  if (schedule) scheduleRefreshTimer(value);
  if (publish)
    publishMessage({ type: "refresh-succeeded", accessTokenExpiresAt: value });
  return true;
}

export function setAccessTokenExpiresAt(value) {
  applyAccessTokenExpiresAt(value, { persist: true, publish: true });
}

export function clearAccessTokenRefresh({ broadcast = false } = {}) {
  clearRefreshTimer();
  clearRetryTimer();
  accessTokenExpiresAt = null;
  removeLocalStorageValue(EXPIRY_STORAGE_KEY);
  removeLocalStorageValue(RETRY_STORAGE_KEY);
  try {
    globalThis.sessionStorage?.removeItem(EXPIRY_STORAGE_KEY);
  } catch {
    // 이전 버전의 탭 단위 만료 메타데이터 정리 실패는 무시한다.
  }
  if (broadcast) publishMessage({ type: "session-expired" });
}

function publishMessage(message) {
  try {
    authChannel?.postMessage(message);
  } catch {
    // BroadcastChannel을 사용할 수 없으면 storage 이벤트만 사용한다.
  }
  setLocalStorageValue(
    AUTH_EVENT_STORAGE_KEY,
    JSON.stringify({ ...message, sentAt: Date.now(), nonce: Math.random() }),
  );
}

function handleSessionFailure({ broadcast = true } = {}) {
  if (sessionFailureHandled) return;
  sessionFailureHandled = true;
  clearAccessTokenRefresh();
  sessionStorage.removeItem("community.user");
  sessionStorage.removeItem("userId");
  globalThis.dispatchEvent?.(new CustomEvent("auth:expired"));
  if (broadcast) publishMessage({ type: "session-expired" });
  if (!redirecting && globalThis.location?.pathname !== "/login") {
    redirecting = true;
    history.replaceState({}, "", "/login");
    globalThis.dispatchEvent?.(new PopStateEvent("popstate"));
  }
}

function handleSharedMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "refresh-succeeded") {
    if (tabHasAuthenticatedSession())
      applyAccessTokenExpiresAt(message.accessTokenExpiresAt);
    return;
  }
  if (message.type === "refresh-retry") {
    if (tabHasAuthenticatedSession()) scheduleRetryTimer(message.state);
    return;
  }
  if (message.type === "session-expired") {
    handleSessionFailure({ broadcast: false });
  }
}

function deferredRetryError() {
  return new ApiError("세션 갱신을 잠시 후 다시 시도합니다.", {
    code: RETRY_DEFERRED_CODE,
  });
}

function retryStateMatchesExpiry(state, expiry) {
  return Boolean(state && state.accessTokenExpiresAt === expiry);
}

function recordTransientFailure(trigger, currentExpiry) {
  const current = readRetryState();
  const retryAttempt = trigger === "retry" || current?.attempted;
  const next = retryAttempt
    ? {
        accessTokenExpiresAt: currentExpiry,
        attempted: true,
        exhausted: true,
        retryAt: null,
      }
    : {
        accessTokenExpiresAt: currentExpiry,
        attempted: true,
        exhausted: false,
        retryAt: Date.now() + TRANSIENT_RETRY_MS,
      };
  writeRetryState(next);
  scheduleRetryTimer(next);
}

async function performRefreshRequest() {
  const response = await send("/api/users/refresh", { method: "POST" });
  const body = await parse(response);
  if (!response.ok) throw toApiError(response, body);
  const value = body?.data ?? body;
  const expiresAt = expiryValue(value);
  if (!validExpiry(expiresAt)) {
    throw new ApiError("Refresh 응답에 Access Token 만료 시각이 없습니다.", {
      status: response.status,
      code: "INVALID_REFRESH_RESPONSE",
      response,
    });
  }
  applyAccessTokenExpiresAt(expiresAt, { persist: true, publish: true });
  return value;
}

async function runRefreshInsideLock({ force, observedExpiry, trigger }) {
  const sharedExpiry = readSharedExpiry() ?? accessTokenExpiresAt;
  if (
    validExpiry(observedExpiry) &&
    !validExpiry(sharedExpiry) &&
    !tabHasAuthenticatedSession()
  ) {
    throw new ApiError("활성 세션이 없습니다.", {
      code: "SESSION_NOT_ACTIVE",
    });
  }
  if (
    validExpiry(sharedExpiry) &&
    sharedExpiry !== observedExpiry &&
    !expiringSoon(sharedExpiry)
  ) {
    applyAccessTokenExpiresAt(sharedExpiry);
    return { accessTokenExpiresAt: sharedExpiry, refreshed: false };
  }

  let retryState = readRetryState();
  if (retryState && !retryStateMatchesExpiry(retryState, sharedExpiry)) {
    writeRetryState(null);
    retryState = null;
  }
  if (retryState?.retryAt && Number(retryState.retryAt) > Date.now()) {
    scheduleRetryTimer(retryState);
    throw deferredRetryError();
  }
  if (trigger === "retry" && retryState?.exhausted) {
    throw deferredRetryError();
  }
  if (trigger !== "retry" && retryState?.exhausted) {
    writeRetryState(null);
  }
  if (!force && validExpiry(sharedExpiry) && !expiringSoon(sharedExpiry)) {
    applyAccessTokenExpiresAt(sharedExpiry);
    return { accessTokenExpiresAt: sharedExpiry, refreshed: false };
  }

  try {
    return await performRefreshRequest();
  } catch (cause) {
    if (isTerminalRefreshFailure(cause)) {
      handleSessionFailure();
    } else if (!isAbortError(cause) && !isDeferredRetry(cause)) {
      recordTransientFailure(trigger, sharedExpiry);
    }
    throw cause;
  }
}

async function withRefreshLock(callback) {
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request !== "function") return callback();
  return locks.request(REFRESH_LOCK_NAME, { mode: "exclusive" }, callback);
}

async function executeRefresh({ force = false, trigger = "request" } = {}) {
  if (!refreshPromise) {
    const observedExpiry = readSharedExpiry() ?? accessTokenExpiresAt;
    refreshPromise = withRefreshLock(() =>
      runRefreshInsideLock({ force, observedExpiry, trigger }),
    ).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function checkAccessTokenExpiry(trigger = "request") {
  if (!expiringSoon()) return false;
  await executeRefresh({ trigger });
  return true;
}

export async function httpClient(path, options = {}) {
  const pathname = path.split("?")[0];
  try {
    if (!NO_REFRESH_PATHS.has(pathname))
      await checkAccessTokenExpiry("request");
    let response = await send(path, options);
    let body = await parse(response);
    const expired =
      response.status === 401 &&
      (body?.code === "EXPIRED_ACCESS_TOKEN" ||
        body?.message === "expired_access_token");
    if (expired && !options.__retried && !NO_REFRESH_PATHS.has(pathname)) {
      await executeRefresh({ force: true, trigger: "reactive" });
      response = await send(path, { ...options, __retried: true });
      body = await parse(response);
    }
    if (!response.ok) throw toApiError(response, body);
    const value = body?.data ?? body;
    const expiresAt = expiryValue(value);
    if (expiresAt) setAccessTokenExpiresAt(expiresAt);
    return value;
  } catch (cause) {
    if (isAbortError(cause) || cause instanceof ApiError) throw cause;
    throw new ApiError("백엔드 서버에 연결할 수 없습니다.", { cause });
  }
}

function restoreExpiry() {
  if (!tabHasAuthenticatedSession()) return;
  const stored = readSharedExpiry();
  if (stored) applyAccessTokenExpiresAt(stored);
}

function initializeSharedEvents() {
  if (typeof globalThis.BroadcastChannel === "function") {
    try {
      authChannel = new BroadcastChannel(REFRESH_CHANNEL_NAME);
      authChannel.addEventListener("message", (event) =>
        handleSharedMessage(event.data),
      );
    } catch {
      authChannel = null;
    }
  }
  globalThis.addEventListener?.("storage", (event) => {
    if (event.key === EXPIRY_STORAGE_KEY && validExpiry(event.newValue)) {
      if (tabHasAuthenticatedSession())
        applyAccessTokenExpiresAt(event.newValue);
      return;
    }
    if (event.key === RETRY_STORAGE_KEY) {
      const state = parseStoredJson(event.newValue);
      if (tabHasAuthenticatedSession() && state) scheduleRetryTimer(state);
      return;
    }
    if (event.key === AUTH_EVENT_STORAGE_KEY) {
      handleSharedMessage(parseStoredJson(event.newValue));
    }
  });
}

if (typeof document !== "undefined") {
  initializeSharedEvents();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible")
      checkAccessTokenExpiry("visibility").catch(() => {});
  });
  restoreExpiry();
}

export function resetHttpClientForTests() {
  refreshPromise = null;
  redirecting = false;
  sessionFailureHandled = false;
  clearAccessTokenRefresh();
  removeLocalStorageValue(AUTH_EVENT_STORAGE_KEY);
}
