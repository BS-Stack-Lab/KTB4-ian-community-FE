import { useCallback, useEffect, useRef, useState } from "react";
import { postApi } from "../../../../entities/post/api/postApi.js";
import { normalizePost } from "../../../../entities/post/model/normalizePost.js";
import { sortPostsByLatest } from "../../../../entities/post/model/sortPostsByLatest.js";
import { optimisticLike, togglePostLike } from "../../like/togglePostLike.js";

const PAGE_SIZE = 10;

function appendUnique(current, next) {
  const unique = new Map(current.map((post) => [post.postId, post]));
  next.forEach((post) => unique.set(post.postId, post));
  return sortPostsByLatest([...unique.values()]);
}

export function usePostSlice({
  fetchPage,
  resetKey,
  onBookmarksChanged = () => {},
  onReplaceStart = () => {},
  onReplaceComplete = () => {},
}) {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [bookmarking, setBookmarking] = useState(new Set());
  const [liking, setLiking] = useState(new Set());
  const loadMoreRef = useRef(null);
  const loadMorePendingRef = useRef(false);
  const autoLoadPageRef = useRef(null);
  const requestControllersRef = useRef(new Set());
  const callbacksRef = useRef({
    onBookmarksChanged,
    onReplaceStart,
    onReplaceComplete,
  });
  callbacksRef.current = {
    onBookmarksChanged,
    onReplaceStart,
    onReplaceComplete,
  };

  const abortRequests = useCallback(() => {
    requestControllersRef.current.forEach((controller) => controller.abort());
    requestControllersRef.current.clear();
    loadMorePendingRef.current = false;
  }, []);

  const load = useCallback(
    async (targetPage = 0, replace = true) => {
      if (!replace && loadMorePendingRef.current) return;
      if (replace) {
        abortRequests();
        autoLoadPageRef.current = null;
        callbacksRef.current.onReplaceStart();
        setLoading(true);
      } else {
        loadMorePendingRef.current = true;
        setLoadingMore(true);
      }

      const controller = new AbortController();
      requestControllersRef.current.add(controller);

      try {
        const result = await fetchPage({
          page: targetPage,
          size: PAGE_SIZE,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const next = (result?.content || []).map(normalizePost);
        setPosts((current) =>
          replace ? sortPostsByLatest(next) : appendUnique(current, next),
        );
        setPage(targetPage);
        setHasNext(Boolean(result?.hasNext ?? result?.has_next));
        setError("");
      } catch (cause) {
        if (cause.name !== "AbortError") setError(cause.message);
      } finally {
        requestControllersRef.current.delete(controller);
        if (!controller.signal.aborted) {
          if (replace) callbacksRef.current.onReplaceComplete();
          setLoading(false);
          setLoadingMore(false);
        }
        if (!replace) loadMorePendingRef.current = false;
      }
    },
    [abortRequests, fetchPage],
  );

  useEffect(() => {
    setPosts([]);
    setError("");
    load(0, true);
    return abortRequests;
  }, [abortRequests, load, resetKey]);

  useEffect(() => {
    if (
      !hasNext ||
      loadingMore ||
      !loadMoreRef.current ||
      typeof IntersectionObserver === "undefined"
    )
      return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      const targetPage = page + 1;
      if (!entry.isIntersecting || autoLoadPageRef.current === targetPage)
        return;
      autoLoadPageRef.current = targetPage;
      load(targetPage, false);
    });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNext, load, loadingMore, page, posts.length]);

  const like = useCallback(
    async (postId) => {
      const before = posts.find((post) => post.postId === postId);
      if (!before || liking.has(postId)) return;
      setLiking((current) => new Set(current).add(postId));
      setPosts((current) =>
        current.map((post) =>
          post.postId === postId ? optimisticLike(post) : post,
        ),
      );
      try {
        const updated = await togglePostLike(before);
        setPosts((current) =>
          current.map((post) => (post.postId === postId ? updated : post)),
        );
        setError("");
      } catch (cause) {
        setPosts((current) =>
          current.map((post) => (post.postId === postId ? before : post)),
        );
        setError(cause.message);
      } finally {
        setLiking((current) => {
          const next = new Set(current);
          next.delete(postId);
          return next;
        });
      }
    },
    [liking, posts],
  );

  const bookmark = useCallback(
    async (postId) => {
      const before = posts.find((post) => post.postId === postId);
      if (!before || bookmarking.has(postId)) return;
      setBookmarking((current) => new Set(current).add(postId));
      setPosts((current) =>
        current.map((post) =>
          post.postId === postId
            ? { ...post, bookmarked: !post.bookmarked }
            : post,
        ),
      );
      try {
        let bookmarked;
        if (before.bookmarked) {
          await postApi.deleteBookmark(postId);
          bookmarked = false;
        } else {
          const result = await postApi.addBookmark(postId);
          bookmarked = result?.bookmarked ?? true;
        }
        setPosts((current) =>
          current.map((post) =>
            post.postId === postId ? { ...post, bookmarked } : post,
          ),
        );
        callbacksRef.current.onBookmarksChanged();
        setError("");
      } catch (cause) {
        setPosts((current) =>
          current.map((post) => (post.postId === postId ? before : post)),
        );
        setError(cause.message);
      } finally {
        setBookmarking((current) => {
          const next = new Set(current);
          next.delete(postId);
          return next;
        });
      }
    },
    [bookmarking, posts],
  );

  const removePost = useCallback((postId) => {
    setPosts((current) => current.filter((post) => post.postId !== postId));
  }, []);

  return {
    posts,
    page,
    hasNext,
    loading,
    loadingMore,
    error,
    liking,
    bookmarking,
    loadMoreRef,
    load,
    like,
    bookmark,
    removePost,
  };
}
