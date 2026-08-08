import { useCallback, useEffect, useState } from "react";
import { postApi } from "../../entities/post/api/postApi.js";
import { normalizePost } from "../../entities/post/model/normalizePost.js";
import { PostCard } from "../../entities/post/ui/PostCard.jsx";
import { CommentForm } from "../../features/comment/create/CommentForm.jsx";
import { EditCommentModal } from "../../features/comment/edit/EditCommentModal.jsx";
import { EditPostModal } from "../../features/post/edit/EditPostModal.jsx";
import {
  optimisticLike,
  togglePostLike,
} from "../../features/post/like/togglePostLike.js";
import { DeletePostModal } from "../../features/post/delete/DeletePostModal.jsx";
import { DeleteCommentModal } from "../../features/comment/delete/DeleteCommentModal.jsx";
import { PageHeader } from "../../shared/ui/PageHeader.jsx";
import { CommentItem } from "../../entities/comment/ui/CommentItem.jsx";
import { Button } from "../../shared/ui/Button.jsx";

export function PostDetailPage({
  postId,
  user,
  onNavigate,
  onBookmarksChanged = () => {},
}) {
  const [post, setPost] = useState(null);
  const [error, setError] = useState("");
  const [editingComment, setEditingComment] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingComment, setDeletingComment] = useState(null);
  const [optionCommentId, setOptionCommentId] = useState(null);
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [likePending, setLikePending] = useState(false);

  const load = useCallback(async () => {
    try {
      setPost(normalizePost(await postApi.detail(postId)));
      setError("");
    } catch (cause) {
      setError(cause.message);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function like() {
    if (likePending || !post) {
      return;
    }

    const before = post;

    setLikePending(true);
    setPost(optimisticLike(before));

    try {
      const updated = await togglePostLike(before);

      setPost(updated);
      setError("");
    } catch (cause) {
      setPost(before);
      setError(cause.message);
    } finally {
      setLikePending(false);
    }
  }

  async function bookmark() {
    if (bookmarkPending || !post) {
      return;
    }

    const before = post;
    const bookmarked = !before.bookmarked;

    setBookmarkPending(true);
    setPost({
      ...before,
      bookmarked,
    });

    try {
      let confirmed;
      if (bookmarked) {
        const result = await postApi.addBookmark(postId);
        confirmed = result?.bookmarked ?? true;
      } else {
        await postApi.deleteBookmark(postId);
        confirmed = false;
      }

      setPost((current) => ({ ...current, bookmarked: confirmed }));
      onBookmarksChanged();
      setError("");
    } catch (cause) {
      setPost(before);
      setError(cause.message);
    } finally {
      setBookmarkPending(false);
    }
  }

  if (!post)
    return (
      <main className="page post-detail-page">
        <PageHeader title="피드 상세보기" onBack={() => onNavigate("/feed")} />
        {error ? (
          <div className="feed-state error">
            <p>{error}</p>
            <Button
              variant="outline"
              className="feed-state__action"
              onClick={load}
            >
              다시 시도
            </Button>
          </div>
        ) : (
          <p className="feed-state loading" aria-busy="true">
            피드를 불러오는 중입니다.
          </p>
        )}
      </main>
    );
  const isOwner =
    post.author.userId != null && post.author.userId === user.userId;

  return (
    <main className="page post-detail-page" aria-labelledby="post-detail-title">
      <PageHeader title="피드 상세보기" onBack={() => onNavigate("/feed")} />
      <PostCard
        post={post}
        onLike={like}
        likePending={likePending}
        onBookmark={bookmark}
        bookmarkPending={bookmarkPending}
        onEdit={isOwner ? () => setEditingPost(post) : undefined}
        onDelete={isOwner ? () => setDeleteOpen(true) : undefined}
        ownerOptionsInFooter={isOwner}
        imagePriority
      />
      <CommentForm postId={postId} onCreated={load} />
      <section className="comments">
        {post.comments.map((item) => {
          const commentId = item.commentId ?? item.comment_id;
          const owned = (item.userId ?? item.user_id) === user.userId;
          return (
            <CommentItem
              key={commentId}
              comment={item}
              owned={owned}
              optionsOpen={optionCommentId === commentId}
              onOpenOptions={() => setOptionCommentId(commentId)}
              onCloseOptions={() => setOptionCommentId(null)}
              onEdit={() => setEditingComment(item)}
              onDelete={() => setDeletingComment(item)}
            />
          );
        })}
      </section>
      {error && <p className="error">{error}</p>}
      <EditCommentModal
        open={Boolean(editingComment)}
        onClose={() => setEditingComment(null)}
        comment={editingComment}
        onUpdated={load}
      />
      <EditPostModal
        open={Boolean(editingPost)}
        onClose={() => setEditingPost(null)}
        post={editingPost}
        onUpdated={load}
      />
      <DeletePostModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        post={post}
        onDeleted={() => onNavigate("/feed", { replace: true })}
      />
      <DeleteCommentModal
        open={Boolean(deletingComment)}
        onClose={() => setDeletingComment(null)}
        postId={post.postId}
        comment={deletingComment}
        onDeleted={(commentId) =>
          setPost((current) => ({
            ...current,
            comments: current.comments.filter(
              (item) => (item.commentId ?? item.comment_id) !== commentId,
            ),
            commentCount: Math.max(0, current.commentCount - 1),
          }))
        }
      />
    </main>
  );
}
