export function navigate(path, { replace = false } = {}) {
  const usesStaticEntry =
    location.pathname.endsWith("/index.html") || location.hash.startsWith("#/");
  const destination = usesStaticEntry
    ? `${location.pathname}${location.search}#${path}`
    : path;
  history[replace ? "replaceState" : "pushState"]({}, "", destination);
  dispatchEvent(new PopStateEvent("popstate"));
  dispatchEvent(new CustomEvent("app:navigation", { detail: { path } }));
}

export function currentRoute() {
  const path = location.hash.startsWith("#/")
    ? location.hash.slice(1)
    : location.pathname;
  if (
    path === "/" ||
    path === "/login" ||
    path.endsWith("/index.html") ||
    path.endsWith("/pages/login/login.html")
  )
    return { name: "login" };
  if (path === "/signup") return { name: "signup" };
  if (path === "/feed" || path.endsWith("/pages/posts/posts.html"))
    return { name: "feed" };
  if (path === "/bookmarks" || path.endsWith("/pages/bookmarks/bookmarks.html"))
    return { name: "bookmarks" };
  if (path === "/mypage") return { name: "profile", profileUserId: null };
  const profileMatch = path.match(/^\/users\/([1-9]\d*)$/);
  if (profileMatch) return { name: "profile", profileUserId: profileMatch[1] };
  const match = path.match(/^\/posts\/(\d+)$/);
  if (match) return { name: "post", postId: match[1] };
  if (path.endsWith("/pages/post-detail/post-detail.html"))
    return {
      name: "post",
      postId: new URLSearchParams(location.search).get("postId") || "1",
    };
  return { name: "not-found" };
}

export function sameUserId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

export function profilePathFor(authorUserId, viewerUserId) {
  const normalized = String(authorUserId ?? "");
  if (!/^[1-9]\d*$/.test(normalized)) return null;
  return sameUserId(authorUserId, viewerUserId)
    ? "/mypage"
    : `/users/${normalized}`;
}
