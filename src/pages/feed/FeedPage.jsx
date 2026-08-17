import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePost } from "../../entities/post/model/normalizePost.js";
import { sortPostsByLatest } from "../../entities/post/model/sortPostsByLatest.js";
import { postApi } from "../../entities/post/api/postApi.js";
import { PostCard } from "../../entities/post/ui/PostCard.jsx";
import { UserAvatar } from "../../entities/user/ui/UserAvatar.jsx";
import { EditPostModal } from "../../features/post/edit/EditPostModal.jsx";
import { DeletePostModal } from "../../features/post/delete/DeletePostModal.jsx";
import {
  optimisticLike,
  togglePostLike,
} from "../../features/post/like/togglePostLike.js";
import { useSkeletonReveal } from "../../shared/hooks/useSkeletonReveal.js";
import { FeedPageSkeleton } from "./FeedPageSkeleton.jsx";
import { Button } from "../../shared/ui/Button.jsx";
import { profilePathFor } from "../../app/router/navigation.js";

const PAGE_SIZE = 10;
const PREFETCH_REMAINING = 5;

function appendUnique(current, next) {
  const unique = new Map(current.map((post) => [post.postId, post]));

  next.forEach((post) => {
    unique.set(post.postId, post);
  });

  return sortPostsByLatest([...unique.values()]);
}

export function FeedPage({
  user,
  onNavigate,
  onCreatePost,
  onBookmarksChanged = () => {},
  refreshKey = 0,
}) {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [bookmarking, setBookmarking] = useState(new Set());
  const [liking, setLiking] = useState(new Set());
  const [editingPost, setEditingPost] = useState(null);
  const [deletingPost, setDeletingPost] = useState(null);
  const loadMoreRef = useRef(null);
  const loadMorePendingRef = useRef(false);
  const autoLoadPageRef = useRef(null);
  const reveal = useSkeletonReveal();

  const load = useCallback(
    async (targetPage = 0, replace = true) => {
      if (!replace && loadMorePendingRef.current) {
        return;
      }

      if (replace) {
        autoLoadPageRef.current = null;
        reveal.startLoading();
        setLoading(true);
      } else {
        loadMorePendingRef.current = true;
        setLoadingMore(true);
      }

      try {
        const result = await postApi.list({
          page: targetPage,
          size: PAGE_SIZE,
        });

        const next = (result?.content || []).map(normalizePost);

        setPosts((current) =>
          replace ? sortPostsByLatest(next) : appendUnique(current, next),
        );

        setPage(targetPage);
        setHasNext(Boolean(result?.hasNext ?? result?.has_next));
        setError("");
      } catch (cause) {
        setError(cause.message);
      } finally {
        if (replace) {
          reveal.revealContent();
        }
        setLoading(false);
        setLoadingMore(false);
        if (!replace) {
          loadMorePendingRef.current = false;
        }
      }
    },
    [reveal.revealContent, reveal.startLoading],
  );

  useEffect(() => {
    load(0, true);
  }, [load, refreshKey]);

  useEffect(() => {
    if (!posts.some((post) => post.mediaProcessing)) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await postApi.list({
          page: 0,
          size: PAGE_SIZE,
          signal: controller.signal,
        });
        const next = (result?.content || []).map(normalizePost);
        setPosts((current) => appendUnique(current, next));
      } catch (cause) {
        if (cause?.name !== "AbortError") setError(cause.message);
      }
    }, 2_000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [posts]);

  useEffect(() => {
    if (
      !hasNext ||
      loadingMore ||
      !loadMoreRef.current ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      const targetPage = page + 1;

      if (!entry.isIntersecting || autoLoadPageRef.current === targetPage)
        return;

      autoLoadPageRef.current = targetPage;
      load(targetPage, false);
    });

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
    };
  }, [hasNext, load, loadingMore, page]);

  async function like(postId) {
    const before = posts.find((post) => post.postId === postId);
    if (!before || liking.has(postId)) return;

    setLiking((current) => new Set(current).add(postId));
    setPosts((all) =>
      all.map((post) => (post.postId === postId ? optimisticLike(post) : post)),
    );

    try {
      const updated = await togglePostLike(before);
      setPosts((all) =>
        all.map((post) => (post.postId === postId ? updated : post)),
      );
      setError("");
    } catch (cause) {
      setPosts((all) =>
        all.map((post) => (post.postId === postId ? before : post)),
      );
      setError(cause.message);
    } finally {
      setLiking((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  }

  async function bookmark(postId) {
    const before = posts.find((post) => post.postId === postId);
    if (!before) return;
    if (bookmarking.has(before.postId)) return;
    setBookmarking((current) => new Set(current).add(before.postId));
    setPosts((all) =>
      all.map((post) =>
        post.postId === postId
          ? { ...post, bookmarked: !post.bookmarked }
          : post,
      ),
    );
    try {
      let bookmarked;
      if (before.bookmarked) {
        await postApi.deleteBookmark(before.postId);
        bookmarked = false;
      } else {
        const result = await postApi.addBookmark(before.postId);
        bookmarked = result?.bookmarked ?? true;
      }

      setPosts((all) =>
        all.map((post) =>
          post.postId === postId ? { ...post, bookmarked } : post,
        ),
      );
      onBookmarksChanged();
      setError("");
    } catch (cause) {
      setPosts((all) =>
        all.map((post) => (post.postId === postId ? before : post)),
      );

      setError(cause.message);
    } finally {
      setBookmarking((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  }

  return (
    <main
      className="page feed-page skeleton-shell"
      aria-busy={loading}
      aria-labelledby="feed-page-title"
    >
      {reveal.isSkeletonVisible && (
        <div
          className={`skeleton-layer ${reveal.isSkeletonExiting ? "is-exiting" : ""}`}
        >
          <FeedPageSkeleton />
        </div>
      )}
      <div
        data-testid="feed-content"
        className={`content-layer ${reveal.isContentVisible ? "is-visible" : ""}`}
      >
        <header className="feed-page__intro">
          <h1 id="feed-page-title">피드</h1>
          <button
            className="create-trigger"
            type="button"
            onClick={onCreatePost}
          >
            <span>
              <UserAvatar
                profileImage={user.profileImage}
                profileMedia={user.profileMedia}
                nickname={user.nickname}
              />
              <span className="create-trigger__placeholder">
                새로운 게시물을 작성해보세요
              </span>
            </span>
            <b>피드 게시하기</b>
          </button>
        </header>
        {loading ? (
          <div className="feed-state loading" aria-busy="true">
            피드를 불러오는 중입니다.
          </div>
        ) : error && !posts.length ? (
          <div className="feed-state error">
            <p>{error}</p>
            <Button
              variant="outline"
              className="feed-state__action"
              onClick={() => load(0, true)}
            >
              다시 시도
            </Button>
          </div>
        ) : posts.length ? (
          <>
            {posts.map((post, index) => {
              const isOwner =
                post.author.userId != null &&
                post.author.userId === user.userId;
              const isPrefetchTarget =
                hasNext && index === posts.length - PREFETCH_REMAINING;
              const authorPath = profilePathFor(
                post.author.userId,
                user.userId,
              );

              return (
                <PostCard
                  key={post.postId}
                  post={post}
                  cardRef={isPrefetchTarget ? loadMoreRef : undefined}
                  onOpen={() => onNavigate(`/posts/${post.postId}`)}
                  onOpenAuthor={
                    authorPath ? () => onNavigate(authorPath) : undefined
                  }
                  onLike={() => like(post.postId)}
                  likePending={liking.has(post.postId)}
                  onBookmark={() => bookmark(post.postId)}
                  bookmarkPending={bookmarking.has(post.postId)}
                  onEdit={isOwner ? () => setEditingPost(post) : undefined}
                  onDelete={isOwner ? () => setDeletingPost(post) : undefined}
                  ownerOptionsInFooter={isOwner}
                  imagePriority={index === 0}
                />
              );
            })}
            {error && <p className="feed-state error">{error}</p>}
            {hasNext && (
              <button
                className="feed-state loading"
                type="button"
                disabled={loadingMore}
                onClick={() => load(page + 1, false)}
              >
                {loadingMore ? "피드를 불러오는 중입니다." : "피드 더 보기"}
              </button>
            )}
          </>
        ) : (
          <p className="feed-state empty">아직 생성된 피드가 없어요.</p>
        )}
        <EditPostModal
          open={Boolean(editingPost)}
          onClose={() => setEditingPost(null)}
          post={editingPost}
          onUpdated={() => load(0, true)}
        />
        <DeletePostModal
          open={Boolean(deletingPost)}
          onClose={() => setDeletingPost(null)}
          post={deletingPost}
          onDeleted={(postId) =>
            setPosts((current) =>
              current.filter((post) => post.postId !== postId),
            )
          }
        />
      </div>
    </main>
  );
}
