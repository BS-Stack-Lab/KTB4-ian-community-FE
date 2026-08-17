import { useEffect, useRef, useState } from "react";
import { mediaApi } from "../../../entities/media/api/mediaApi.js";
import { preferredVariant } from "../../../entities/media/model/mediaModel.js";
import { postApi } from "../../../entities/post/api/postApi.js";
import { UserAvatar } from "../../../entities/user/ui/UserAvatar.jsx";
import {
  cameraIcon,
  directionTopIcon,
  feedPreviewCloseLeftIcon,
  feedPreviewCloseRightIcon,
} from "../../../shared/assets/index.js";
import { apiAssetUrl } from "../../../shared/config/env.js";
import { Modal } from "../../../shared/ui/Modal.jsx";
import {
  createOrientedPreview,
  defaultNormalizedCrop,
  frameAspect,
  initialPostFrame,
} from "../../media/lib/imagePreview.js";
import {
  createMediaOperationId,
  uploadMediaWithoutWaiting,
} from "../../media/model/mediaOrchestrator.js";
import { FeedImageEditModal } from "../../media/ui/FeedImageEditModal.jsx";

function previewUrl(attachment) {
  return apiAssetUrl(
    preferredVariant(attachment?.media, 448)?.url || attachment?.preview?.url,
    null,
  );
}

export function CreatePostModal({ open, onClose, user, onCreated }) {
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [failedMediaId, setFailedMediaId] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const textareaRef = useRef(null);
  const pendingRef = useRef(false);
  const editorAbortRef = useRef(null);
  const valid = content.trim().length > 0 && !pending && !editorPending;

  useEffect(() => {
    if (!open) return;
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open || editorOpen || !textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    const contentHeight = textarea.scrollHeight - 3;
    textarea.style.height = `${Math.min(Math.max(contentHeight, 36), 324)}px`;
  }, [open, editorOpen, content]);

  function discardMedia(mediaId) {
    if (mediaId) mediaApi.cancel(mediaId).catch(() => {});
  }

  function discardAttachment(value, { revoke = true } = {}) {
    discardMedia(value?.media?.mediaId);
    if (revoke && value?.preview?.url) URL.revokeObjectURL(value.preview.url);
  }

  async function openFileEditor(file) {
    if (file.size > 10 * 1024 * 1024) {
      setError("게시글 이미지는 10MiB 이하만 업로드할 수 있습니다.");
      return;
    }
    try {
      const preview = await createOrientedPreview(file);
      const frame = initialPostFrame(preview.width, preview.height);
      setDraft({
        kind: "file",
        file,
        preview,
        frame,
        initialEdit: {
          purpose: "POST",
          frame,
          rotation: 0,
          crop: defaultNormalizedCrop(
            preview.width,
            preview.height,
            frameAspect(frame),
          ),
          zoom: 1,
        },
      });
      setEditorError("");
      setError("");
      setEditorOpen(true);
    } catch (cause) {
      setError(cause.message || "이미지 미리보기를 만들 수 없습니다.");
    }
  }

  function choose(event) {
    const file = event.target.files[0] || null;
    event.target.value = "";
    if (file) openFileEditor(file);
  }

  function editAttachedImage() {
    if (!attachment) return;
    setDraft({
      kind: "file",
      file: attachment.file,
      preview: attachment.preview,
      frame: attachment.edit.frame,
      initialEdit: attachment.edit,
      reusingAttachment: true,
    });
    setEditorError("");
    setEditorOpen(true);
  }

  function cancelImageEditor() {
    editorAbortRef.current?.abort();
    discardMedia(failedMediaId);
    setFailedMediaId(null);
    if (draft?.preview?.url && !draft.reusingAttachment) {
      URL.revokeObjectURL(draft.preview.url);
    }
    setDraft(null);
    setEditorPending(false);
    setEditorError("");
    setEditorOpen(false);
  }

  async function attachImage(edit) {
    if (!draft?.file || editorPending) return;
    setEditorError("");
    discardMedia(failedMediaId);
    setFailedMediaId(null);
    const previous = attachment;
    const next = {
      file: draft.file,
      preview: draft.preview,
      edit,
      operationId: createMediaOperationId(),
      media: null,
    };
    setAttachment(next);
    if (previous && previous !== next) {
      discardAttachment(previous, {
        revoke: previous.preview?.url !== draft.preview?.url,
      });
    }
    setDraft(null);
    setEditorOpen(false);
  }

  function removeImage() {
    discardAttachment(attachment);
    setAttachment(null);
  }

  function cancelAndClose() {
    editorAbortRef.current?.abort();
    discardMedia(failedMediaId);
    discardAttachment(attachment);
    if (
      draft?.preview?.url &&
      draft.preview?.url !== attachment?.preview?.url
    ) {
      URL.revokeObjectURL(draft.preview.url);
    }
    setContent("");
    setAttachment(null);
    setDraft(null);
    setEditorOpen(false);
    setError("");
    onClose();
  }

  async function submit() {
    if (!valid || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      let media = attachment?.media || null;
      if (attachment && !media) {
        editorAbortRef.current = new AbortController();
        media = await uploadMediaWithoutWaiting(
          attachment.file,
          { ...attachment.edit, operationId: attachment.operationId },
          { signal: editorAbortRef.current.signal },
        );
        setAttachment((current) => (current ? { ...current, media } : current));
      }
      await postApi.createAsyncMedia({
        content: content.trim(),
        mediaIds: media ? [media.mediaId] : [],
      });
      if (attachment?.preview?.url) URL.revokeObjectURL(attachment.preview.url);
      setAttachment(null);
      setContent("");
      await onCreated();
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      editorAbortRef.current = null;
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Modal
        open={open && !editorOpen}
        title="피드 생성"
        onClose={pending ? undefined : cancelAndClose}
        className="feed-create-modal"
      >
        <header className="modal-header">
          <strong>피드 생성</strong>
          <button type="button" onClick={cancelAndClose} disabled={pending}>
            취소
          </button>
        </header>
        <section className="feed-editor">
          <div className="feed-editor__media">
            <div className="identity">
              <UserAvatar
                profileImage={user.profileImage}
                profileMedia={user.profileMedia}
                nickname={user.nickname}
              />
              <strong>{user.nickname}</strong>
            </div>
            {attachment && (
              <div className="feed-editor__preview">
                <button
                  className="feed-editor__preview-open"
                  type="button"
                  aria-label="첨부 이미지 편집"
                  onClick={editAttachedImage}
                  disabled={pending}
                >
                  <img
                    src={previewUrl(attachment)}
                    alt="선택한 이미지 미리보기"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                  />
                </button>
                <button
                  className="feed-editor__remove"
                  type="button"
                  aria-label="선택한 이미지 제거"
                  onClick={removeImage}
                  disabled={pending}
                >
                  <span className="feed-editor__remove-icon" aria-hidden="true">
                    <img src={feedPreviewCloseLeftIcon} alt="" />
                    <img src={feedPreviewCloseRightIcon} alt="" />
                  </span>
                </button>
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            aria-label="피드 본문"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="무슨 생각을 하고 계신가요?"
            disabled={pending}
          />
          {error && (
            <div className="error" role="alert">
              <p>{error}</p>
            </div>
          )}
        </section>
        <footer className="editor-footer">
          <label className="camera">
            <img src={cameraIcon} alt="이미지 선택" />
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp,.jpg,.jpeg,.png,.webp,.bmp"
              onChange={choose}
              disabled={pending}
            />
          </label>
          <button
            className="submit-icon"
            type="button"
            aria-label="피드 게시"
            disabled={!valid}
            onClick={submit}
          >
            <img src={directionTopIcon} alt="" />
          </button>
        </footer>
      </Modal>
      <FeedImageEditModal
        open={open && editorOpen}
        source={draft?.preview?.url}
        width={draft?.preview?.width}
        height={draft?.preview?.height}
        frame={draft?.frame}
        initialEdit={draft?.initialEdit}
        pending={editorPending}
        error={editorError}
        onCancel={cancelImageEditor}
        onAttach={attachImage}
      />
    </>
  );
}
