import { useCallback, useEffect, useRef, useState } from "react";
import { postApi } from "../../entities/post/api/postApi.js";
import { PostCard } from "../../entities/post/ui/PostCard.jsx";
import { userApi } from "../../entities/user/api/userApi.js";
import { normalizeUserProfile } from "../../entities/user/model/normalizeUserProfile.js";
import { ProfileHeader } from "../../entities/user/ui/ProfileHeader.jsx";
import { DeletePostModal } from "../../features/post/delete/DeletePostModal.jsx";
import { EditPostModal } from "../../features/post/edit/EditPostModal.jsx";
import { usePostSlice } from "../../features/post/list/model/usePostSlice.js";
import { profilePathFor, sameUserId } from "../../app/router/navigation.js";
import { Button } from "../../shared/ui/Button.jsx";

const PREFETCH_REMAINING = 5;
const COUNT_REVALIDATION_DELAYS = [250, 500, 1000];

export function ProfilePage({
  profileUserId,
  viewer,
  onNavigate,
  onBack,
  onBookmarksChanged = () => {},
}) {
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [followPending, setFollowPending] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [deletingPost, setDeletingPost] = useState(null);
  const profileControllerRef = useRef(null);
  const revalidationTimersRef = useRef([]);

  const loadProfile = useCallback(
    async ({ silent = false } = {}) => {
      profileControllerRef.current?.abort();
      const controller = new AbortController();
      profileControllerRef.current = controller;
      if (!silent) {
        setProfile(null);
        setProfileLoading(true);
      }
      try {
        const next = normalizeUserProfile(
          await userApi.profile(profileUserId, { signal: controller.signal }),
        );
        if (controller.signal.aborted) return;
        setProfile(next);
        setProfileError("");
      } catch (cause) {
        if (cause.name !== "AbortError") setProfileError(cause.message);
      } finally {
        if (!controller.signal.aborted) setProfileLoading(false);
      }
    },
    [profileUserId],
  );

  useEffect(() => {
    loadProfile();
    return () => profileControllerRef.current?.abort();
  }, [loadProfile]);

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") loadProfile({ silent: true });
    };
    document.addEventListener("visibilitychange", revalidate);
    return () => document.removeEventListener("visibilitychange", revalidate);
  }, [loadProfile]);

  useEffect(
    () => () => {
      revalidationTimersRef.current.forEach(clearTimeout);
    },
    [profileUserId],
  );

  const fetchPage = useCallback(
    (options) => postApi.byUser(profileUserId, options),
    [profileUserId],
  );
  const {
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
  } = usePostSlice({
    fetchPage,
    resetKey: profileUserId,
    onBookmarksChanged,
  });

  async function toggleFollow() {
    if (!profile || profile.profileType === "SELF" || followPending) return;
    const before = profile;
    const following = before.profileType === "OTHER_FOLLOWING";
    setFollowPending(true);
    setProfile({
      ...before,
      profileType: following ? "OTHER_NOT_FOLLOWING" : "OTHER_FOLLOWING",
      followerCount: Math.max(0, before.followerCount + (following ? -1 : 1)),
    });
    try {
      const result = following
        ? await userApi.unfollow(profileUserId)
        : await userApi.follow(profileUserId);
      setProfile((current) => ({
        ...current,
        profileType:
          result?.profileType ?? result?.profile_type ?? current.profileType,
      }));
      setProfileError("");
      revalidationTimersRef.current.forEach(clearTimeout);
      revalidationTimersRef.current = COUNT_REVALIDATION_DELAYS.map((delay) =>
        setTimeout(() => loadProfile({ silent: true }), delay),
      );
    } catch (cause) {
      setProfile(before);
      setProfileError(cause.message);
    } finally {
      setFollowPending(false);
    }
  }

  const isSelf = profile?.profileType === "SELF";

  return (
    <main
      className="page profile-page"
      aria-busy={profileLoading || loading}
      data-testid="profile-page"
    >
      {profile ? (
        <ProfileHeader
          profile={profile}
          onBack={onBack}
          onToggleFollow={toggleFollow}
          followPending={followPending}
        />
      ) : (
        <section className="profile-header profile-header--state">
          <button
            className="profile-header__back"
            type="button"
            aria-label="뒤로가기"
            onClick={onBack}
          >
            <span aria-hidden="true">‹</span>
          </button>
          {profileError ? (
            <div className="feed-state error">
              <p>{profileError}</p>
              <Button variant="outline" onClick={() => loadProfile()}>
                다시 시도
              </Button>
            </div>
          ) : (
            <p className="feed-state loading">프로필을 불러오는 중입니다.</p>
          )}
        </section>
      )}
      {profileError && profile && (
        <p className="profile-page__message error" role="alert">
          {profileError}
        </p>
      )}
      {loading ? (
        <p className="feed-state loading">피드를 불러오는 중입니다.</p>
      ) : error && !posts.length ? (
        <div className="feed-state error">
          <p>{error}</p>
          <Button variant="outline" onClick={() => load(0, true)}>
            다시 시도
          </Button>
        </div>
      ) : posts.length ? (
        <>
          {posts.map((post, index) => {
            const owner =
              isSelf && sameUserId(post.author.userId, viewer.userId);
            const isPrefetchTarget =
              hasNext && index === posts.length - PREFETCH_REMAINING;
            return (
              <PostCard
                key={post.postId}
                post={post}
                cardRef={isPrefetchTarget ? loadMoreRef : undefined}
                onOpen={() => onNavigate(`/posts/${post.postId}`)}
                onOpenAuthor={() => {
                  const path = profilePathFor(
                    post.author.userId,
                    viewer.userId,
                  );
                  if (path) onNavigate(path);
                }}
                onLike={() => like(post.postId)}
                likePending={liking.has(post.postId)}
                onBookmark={() => bookmark(post.postId)}
                bookmarkPending={bookmarking.has(post.postId)}
                onEdit={owner ? () => setEditingPost(post) : undefined}
                onDelete={owner ? () => setDeletingPost(post) : undefined}
                ownerOptionsInFooter={owner}
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
        onDeleted={removePost}
      />
    </main>
  );
}
