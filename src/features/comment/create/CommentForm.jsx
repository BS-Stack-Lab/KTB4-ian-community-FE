import { useRef, useState } from "react";
import { postApi } from "../../../entities/post/api/postApi.js";
import { directionTopIcon } from "../../../shared/assets/index.js";
import { useReloadBlocker } from "../../../shared/update/useReloadBlocker.js";

export function CommentForm({ postId, onCreated }) {
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const enabled = comment.trim().length > 0 && !pending;
  useReloadBlocker("create-comment", Boolean(comment || pending));

  async function submit(event) {
    event.preventDefault();
    if (!enabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await postApi.comment(postId, comment.trim());
      setComment("");
      await onCreated();
    } catch (cause) {
      setError(cause.message);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section className="comment-composer">
      <form className="comment-form" onSubmit={submit}>
        <textarea
          aria-label="댓글 작성"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="지금 댓글을 작성해보세요."
        />
        <button
          className="submit-icon"
          aria-label="댓글 등록"
          disabled={!enabled}
        >
          <img src={directionTopIcon} alt="" />
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
