import { useEffect, useRef, useState } from "react";
import { postApi } from "../../../entities/post/api/postApi.js";
import { UserAvatar } from "../../../entities/user/ui/UserAvatar.jsx";
import { directionTopIcon } from "../../../shared/assets/index.js";
import { Modal } from "../../../shared/ui/Modal.jsx";
import { useReloadBlocker } from "../../../shared/update/useReloadBlocker.js";

export function EditCommentModal({ open, onClose, comment, onUpdated }) {
  const initialContent = comment?.comment ?? comment?.content ?? "";
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const valid =
    content.trim().length > 0 &&
    content.trim() !== initialContent.trim() &&
    !pending;
  useReloadBlocker(
    "edit-comment",
    open && (pending || content.trim() !== initialContent.trim()),
  );

  useEffect(() => {
    if (!open) return;
    setContent(initialContent);
    setPending(false);
    setError("");
  }, [open, initialContent, comment?.commentId, comment?.comment_id]);

  async function submit() {
    if (!valid || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await postApi.updateComment(
        comment.postId ?? comment.post_id,
        comment.commentId ?? comment.comment_id,
        content.trim(),
      );
      await onUpdated();
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      title="댓글"
      onClose={pending ? undefined : onClose}
      className="comment-edit-modal"
    >
      <header className="modal-header">
        <strong>댓글</strong>
        <button type="button" onClick={onClose} disabled={pending}>
          취소
        </button>
      </header>
      <section className="comment-editor">
        <div className="identity">
          <UserAvatar
            profileImage={comment?.profileImage ?? comment?.profile_image}
            nickname={comment?.nickname}
          />
          <strong>{comment?.nickname}</strong>
        </div>
        <textarea
          aria-label="댓글 내용"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={pending}
        />
        {error && <p className="error">{error}</p>}
      </section>
      <footer className="editor-footer comment-editor-footer">
        <button
          className="submit-icon"
          type="button"
          aria-label="댓글 수정"
          disabled={!valid}
          onClick={submit}
        >
          <img src={directionTopIcon} alt="" />
        </button>
      </footer>
    </Modal>
  );
}
