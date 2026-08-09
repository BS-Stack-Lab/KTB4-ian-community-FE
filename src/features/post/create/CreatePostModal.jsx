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
import { useReloadBlocker } from "../../../shared/update/useReloadBlocker.js";
import {
  createOrientedPreview,
  defaultNormalizedCrop,
  frameAspect,
  initialPostFrame,
} from "../../media/lib/imagePreview.js";
import { uploadMedia } from "../../media/model/mediaOrchestrator.js";
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
  useReloadBlocker(
    "create-post",
    open &&
      Boolean(
        content ||
        attachment ||
        draft ||
        editorOpen ||
        editorPending ||
        pending ||
        failedMediaId,
      ),
  );

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
    if (!attachment || editorPending) return;
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
    const controller = new AbortController();
    const processingDraft = draft;
    const previous = attachment;
    const optimistic = {
      file: processingDraft.file,
      preview: processingDraft.preview,
      edit,
      media: null,
      processing: true,
      previous,
    };
    editorAbortRef.current = controller;
    setEditorPending(true);
    setEditorError("");
    discardMedia(failedMediaId);
    setFailedMediaId(null);
    setAttachment(optimistic);
    setEditorOpen(false);
    try {
      const media = await uploadMedia(processingDraft.file, edit, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        discardMedia(media.mediaId);
        return;
      }
      const next = {
        file: processingDraft.file,
        preview: processingDraft.preview,
        edit,
        media,
      };
      setAttachment(next);
      if (previous && previous !== next) {
        discardAttachment(previous, {
          revoke: previous.preview?.url !== processingDraft.preview?.url,
        });
      }
      setDraft(null);
    } catch (cause) {
      if (cause?.name === "AbortError" || controller.signal.aborted) {
        discardMedia(cause.mediaId);
      } else {
        setAttachment(previous);
        setFailedMediaId(cause.mediaId || null);
        setEditorError(cause.message || "이미지를 처리할 수 없습니다.");
        setEditorOpen(true);
      }
    } finally {
      if (editorAbortRef.current === controller) {
        editorAbortRef.current = null;
        setEditorPending(false);
      }
    }
  }

  function removeImage() {
    editorAbortRef.current?.abort();
    editorAbortRef.current = null;
    setEditorPending(false);
    if (attachment?.processing && attachment.previous) {
      discardAttachment(attachment.previous, {
        revoke: attachment.previous.preview?.url !== attachment.preview?.url,
      });
    }
    discardAttachment(attachment);
    if (draft?.preview?.url && draft.preview.url !== attachment?.preview?.url) {
      URL.revokeObjectURL(draft.preview.url);
    }
    setDraft(null);
    setAttachment(null);
  }

  function cancelAndClose() {
    editorAbortRef.current?.abort();
    editorAbortRef.current = null;
    setEditorPending(false);
    discardMedia(failedMediaId);
    setFailedMediaId(null);
    if (attachment?.processing && attachment.previous) {
      discardAttachment(attachment.previous, {
        revoke: attachment.previous.preview?.url !== attachment.preview?.url,
      });
    }
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
    setEditorError("");
    setError("");
    onClose();
  }

  async function submit() {
    if (!valid || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await postApi.createV2({
        content: content.trim(),
        mediaIds: attachment?.media ? [attachment.media.mediaId] : [],
      });
      if (attachment?.preview?.url) URL.revokeObjectURL(attachment.preview.url);
      setAttachment(null);
      setContent("");
      await onCreated();
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
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
                  disabled={pending || editorPending}
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
                {attachment.processing && (
                  <span className="feed-editor__preview-status" role="status">
                    이미지 처리 중
                  </span>
                )}
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
              accept="image/png,image/jpeg,image/webp"
              onChange={choose}
              disabled={pending || editorPending}
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
