export function defaultApiBaseUrl(location = globalThis.location) {
  const resolvedLocation =
    typeof location === "string" ? { hostname: location } : location;
  const hostname = resolvedLocation?.hostname || "localhost";
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocal) return `http://${hostname}:8080`;
  if (resolvedLocation?.origin && resolvedLocation.origin !== "null")
    return resolvedLocation.origin;

  return "";
}

export function apiBaseUrl() {
  return globalThis.__API_BASE_URL__ ?? defaultApiBaseUrl();
}

export const DEFAULT_PROFILE_PATH = "/images/profile-default.svg";

export function apiAssetUrl(value, fallback = DEFAULT_PROFILE_PATH) {
  const source = value || fallback;
  if (/^(?:https?:|blob:|data:)/i.test(source)) return source;
  return `${apiBaseUrl()}${source.startsWith("/") ? source : `/${source}`}`;
}
