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
  const match = path.match(/^\/posts\/(\d+)$/);
  if (match) return { name: "post", postId: match[1] };
  if (path.endsWith("/pages/post-detail/post-detail.html"))
    return {
      name: "post",
      postId: new URLSearchParams(location.search).get("postId") || "1",
    };
  return { name: "not-found" };
}
