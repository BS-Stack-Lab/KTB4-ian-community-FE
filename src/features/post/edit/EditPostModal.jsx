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
import {
  createMediaOperationId,
  prepareRevisionWithoutWaiting,
  uploadMediaWithoutWaiting,
} from "../../media/model/mediaOrchestrator.js";
import { FeedImageEditModal } from "../../media/ui/FeedImageEditModal.jsx";

function originalAttachment(post) {
  if (post?.media?.[0]) {
    return { kind: "original-v2", media: post.media[0] };
  }
  if (post?.imageUrl) {
    return { kind: "original-legacy", url: post.imageUrl };
  }
  return null;
}

function attachmentUrl(attachment) {
  if (!attachment) return null;
  if (attachment.kind === "new") {
    return apiAssetUrl(
      preferredVariant(attachment.media, 448)?.url || attachment.preview?.url,
      null,
    );
  }
  if (attachment.kind === "revision") {
    return apiAssetUrl(
      preferredVariant(attachment.response, 448)?.url || attachment.previewUrl,
      null,
    );
  }
  if (attachment.kind === "original-v2") {
    return apiAssetUrl(preferredVariant(attachment.media, 448)?.url, null);
  }
  return apiAssetUrl(attachment.url, null);
}

async function legacyFile(imageUrl, signal) {
  const response = await fetch(apiAssetUrl(imageUrl, null), {
    credentials: "include",
    signal,
  });
  if (!response.ok) throw new Error("기존 이미지를 불러올 수 없습니다.");
  const blob = await response.blob();
  const contentType = blob.type.toLowerCase();
  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[contentType];
  if (!extension) {
    throw new Error("기존 이미지는 JPEG, PNG, WebP만 다시 편집할 수 있습니다.");
  }
  return new File([blob], `legacy-feed-image.${extension}`, {
    type: contentType,
  });
}

export function EditPostModal({ open, onClose, post, onUpdated }) {
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [failedDraft, setFailedDraft] = useState(null);
  const [pending, setPending] = useState(false);
  const [sourcePending, setSourcePending] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const textareaRef = useRef(null);
  const pendingRef = useRef(false);
  const editorAbortRef = useRef(null);
  const initialContent = post?.content ?? "";
  const initialAttachment = originalAttachment(post);
  const contentChanged = content.trim() !== initialContent.trim();
  const imageChanged =
    attachment?.kind === "new" ||
    attachment?.kind === "revision" ||
    Boolean(initialAttachment) !== Boolean(attachment);
  const valid =
    content.trim().length > 0 &&
    (contentChanged || imageChanged) &&
    !pending &&
    !editorPending &&
    !sourcePending;
  useReloadBlocker(
    "edit-post",
    open &&
      Boolean(
        contentChanged ||
        imageChanged ||
        draft ||
        editorOpen ||
        editorPending ||
        sourcePending ||
        pending ||
        failedDraft,
      ),
  );

  useEffect(() => {
    if (!open) return;
    setContent(initialContent);
    setAttachment(originalAttachment(post));
    setDraft(null);
    setEditorOpen(false);
    setEditorPending(false);
    setSourcePending(false);
    setFailedDraft(null);
    setError("");
    setEditorError("");
    if (inputRef.current) inputRef.current.value = "";
  }, [open, initialContent, post?.postId]);

  useEffect(() => {
    if (!open || editorOpen || !textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    const contentHeight = textarea.scrollHeight - 3;
    textarea.style.height = `${Math.min(Math.max(contentHeight, 36), 324)}px`;
  }, [open, editorOpen, content]);

  function discardFailed(value = failedDraft) {
    if (value?.revision) {
      mediaApi.cancelRevision(value.mediaId, value.revision).catch(() => {});
    } else if (value?.mediaId) {
      mediaApi.cancel(value.mediaId).catch(() => {});
    }
  }

  function discardPrepared(value, { revoke = true } = {}) {
    if (value?.kind === "new") {
      if (value.media?.mediaId)
        mediaApi.cancel(value.media.mediaId).catch(() => {});
      if (revoke && value.preview?.url) URL.revokeObjectURL(value.preview.url);
    }
    if (value?.kind === "revision") {
      if (value.response?.revision) {
        mediaApi
          .cancelRevision(value.mediaId, value.response.revision)
          .catch(() => {});
      }
    }
  }

  async function createFileDraft(file, { legacy = false } = {}) {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("게시글 이미지는 10MiB 이하만 업로드할 수 있습니다.");
    }
    const preview = await createOrientedPreview(file);
    const frame = initialPostFrame(preview.width, preview.height);
    return {
      kind: "file",
      file,
      preview,
      frame,
      legacy,
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
    };
  }

  async function choose(event) {
    const file = event.target.files[0] || null;
    event.target.value = "";
    if (!file) return;
    try {
      setDraft(await createFileDraft(file));
      setEditorError("");
      setError("");
      setEditorOpen(true);
    } catch (cause) {
      setError(cause.message || "이미지 미리보기를 만들 수 없습니다.");
    }
  }

  async function editAttachedImage() {
    if (!attachment || sourcePending || editorPending) return;
    setSourcePending(true);
    setError("");
    editorAbortRef.current = new AbortController();
    try {
      if (attachment.kind === "new") {
        setDraft({
          kind: "file",
          file: attachment.file,
          preview: attachment.preview,
          frame: attachment.edit.frame,
          initialEdit: attachment.edit,
          reusingAttachment: true,
        });
      } else if (
        attachment.kind === "original-v2" ||
        attachment.kind === "revision"
      ) {
        const mediaId =
          attachment.kind === "revision"
            ? attachment.mediaId
            : attachment.media.mediaId;
        const source = await mediaApi.editSource(mediaId, {
          signal: editorAbortRef.current.signal,
        });
        const initialEdit =
          attachment.kind === "revision"
            ? attachment.edit
            : {
                purpose: "POST",
                frame: source.frame,
                rotation: 0,
                crop: source.crop,
                zoom: source.zoom,
                position: source.position,
              };
        setDraft({
          kind: "revision",
          mediaId,
          source,
          frame: initialEdit.frame,
          initialEdit,
        });
      } else {
        const file = await legacyFile(
          attachment.url,
          editorAbortRef.current.signal,
        );
        setDraft(await createFileDraft(file, { legacy: true }));
      }
      setEditorError("");
      setEditorOpen(true);
    } catch (cause) {
      if (cause?.name !== "AbortError") {
        setError(cause.message || "이미지 편집 원본을 불러올 수 없습니다.");
      }
    } finally {
      editorAbortRef.current = null;
      setSourcePending(false);
    }
  }

  function cancelImageEditor() {
    editorAbortRef.current?.abort();
    discardFailed();
    setFailedDraft(null);
    if (draft?.kind === "file" && !draft.reusingAttachment) {
      URL.revokeObjectURL(draft.preview.url);
    }
    setDraft(null);
    setEditorPending(false);
    setEditorError("");
    setEditorOpen(false);
  }

  async function attachImage(edit) {
    if (!draft || editorPending) return;
    discardFailed();
    setFailedDraft(null);
    setEditorError("");
    const next =
      draft.kind === "revision"
        ? {
            kind: "revision",
            mediaId: draft.mediaId,
            response: null,
            previewUrl: draft.source.url,
            edit,
            operationId: createMediaOperationId(),
          }
        : {
            kind: "new",
            file: draft.file,
            preview: draft.preview,
            media: null,
            edit,
            operationId: createMediaOperationId(),
          };
    const previous = attachment;
    setAttachment(next);
    discardPrepared(previous, {
      revoke: previous?.preview?.url !== next?.preview?.url,
    });
    setDraft(null);
    setEditorOpen(false);
  }

  function removeImage() {
    editorAbortRef.current?.abort();
    editorAbortRef.current = null;
    setEditorPending(false);
    if (attachment?.processing && attachment.previous) {
      discardPrepared(attachment.previous, {
        revoke: attachment.previous.preview?.url !== attachment.preview?.url,
      });
    }
    discardPrepared(attachment);
    if (
      draft?.kind === "file" &&
      draft.preview?.url !== attachment?.preview?.url
    ) {
      URL.revokeObjectURL(draft.preview.url);
    }
    setDraft(null);
    setAttachment(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function cancelAndClose() {
    editorAbortRef.current?.abort();
    editorAbortRef.current = null;
    setEditorPending(false);
    discardFailed();
    setFailedDraft(null);
    if (attachment?.processing && attachment.previous) {
      discardPrepared(attachment.previous, {
        revoke: attachment.previous.preview?.url !== attachment.preview?.url,
      });
    }
    discardPrepared(attachment);
    if (
      draft?.kind === "file" &&
      draft.preview?.url !== attachment?.preview?.url
    ) {
      URL.revokeObjectURL(draft.preview.url);
    }
    setDraft(null);
    setAttachment(null);
    setEditorOpen(false);
    setEditorError("");
    onClose();
  }

  async function submit() {
    if (!valid || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      if (attachment?.kind === "original-legacy" && contentChanged) {
        await postApi.update(post.postId, {
          content: content.trim(),
          imageUrl: attachment.url,
        });
      } else if (!initialAttachment && !attachment && contentChanged) {
        await postApi.update(post.postId, {
          content: content.trim(),
          imageUrl: null,
        });
      } else {
        const remainingMediaIds = (post.media || [])
          .slice(1)
          .map((media) => media.mediaId);
        let mediaIds = remainingMediaIds;
        let revisionActivations = [];
        if (attachment?.kind === "new") {
          let media = attachment.media;
          if (!media) {
            editorAbortRef.current = new AbortController();
            media = await uploadMediaWithoutWaiting(
              attachment.file,
              { ...attachment.edit, operationId: attachment.operationId },
              { signal: editorAbortRef.current.signal },
            );
            setAttachment((current) =>
              current?.kind === "new" ? { ...current, media } : current,
            );
          }
          mediaIds = [media.mediaId, ...remainingMediaIds];
        } else if (attachment?.kind === "revision") {
          let response = attachment.response;
          if (!response) {
            editorAbortRef.current = new AbortController();
            response = await prepareRevisionWithoutWaiting(
              attachment.mediaId,
              { ...attachment.edit, operationId: attachment.operationId },
              { signal: editorAbortRef.current.signal },
            );
            setAttachment((current) =>
              current?.kind === "revision" ? { ...current, response } : current,
            );
          }
          mediaIds = (post.media || []).map((media) => media.mediaId);
          revisionActivations = [
            {
              mediaId: attachment.mediaId,
              revision: response.revision,
              operationId: attachment.operationId,
            },
          ];
        } else if (attachment?.kind === "original-v2") {
          mediaIds = (post.media || []).map((media) => media.mediaId);
        }
        await postApi.updateAsyncMedia(post.postId, {
          content: content.trim(),
          mediaIds: mediaIds.slice(0, 5),
          revisionTargets: revisionActivations,
        });
      }
      if (attachment?.kind === "new" && attachment.preview?.url) {
        URL.revokeObjectURL(attachment.preview.url);
      }
      setAttachment(null);
      await onUpdated();
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      editorAbortRef.current = null;
      pendingRef.current = false;
      setPending(false);
    }
  }

  const displayedImage = attachmentUrl(attachment);

  return (
    <>
      <Modal
        open={open && !editorOpen}
        title="피드 편집"
        onClose={pending ? undefined : cancelAndClose}
        className="feed-edit-modal"
      >
        <header className="modal-header">
          <strong>피드 편집</strong>
          <button type="button" onClick={cancelAndClose} disabled={pending}>
            취소
          </button>
        </header>
        <section className="feed-editor">
          <div className="feed-editor__media">
            <div className="identity">
              <UserAvatar
                profileImage={post?.author.profileImage}
                profileMedia={post?.author.profileMedia}
                nickname={post?.author.nickname}
              />
              <strong>{post?.author.nickname}</strong>
            </div>
            {displayedImage && (
              <div
                className="feed-editor__preview"
                data-preview-kind={attachment?.kind || "none"}
              >
                <button
                  className="feed-editor__preview-open"
                  type="button"
                  aria-label="피드 이미지 편집"
                  onClick={editAttachedImage}
                  disabled={pending || sourcePending || editorPending}
                >
                  <img
                    src={displayedImage}
                    alt="피드 이미지 미리보기"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                  />
                </button>
                <button
                  className="feed-editor__remove"
                  type="button"
                  aria-label="피드 이미지 제거"
                  onClick={removeImage}
                  disabled={pending || sourcePending}
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
            disabled={pending || sourcePending}
          />
          {error && (
            <div className="error" role="alert">
              <p>{error}</p>
            </div>
          )}
        </section>
        <footer className="editor-footer">
          <label className="camera">
            <img src={cameraIcon} alt="변경할 이미지 선택" />
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp,.jpg,.jpeg,.png,.webp,.bmp"
              onChange={choose}
              disabled={pending || sourcePending || editorPending}
            />
          </label>
          <button
            className="submit-icon"
            type="button"
            aria-label="피드 수정"
            disabled={!valid}
            onClick={submit}
          >
            <img src={directionTopIcon} alt="" />
          </button>
        </footer>
      </Modal>
      <FeedImageEditModal
        open={open && editorOpen}
        source={
          draft?.kind === "revision" ? draft.source.url : draft?.preview?.url
        }
        width={
          draft?.kind === "revision"
            ? draft.source.width
            : draft?.preview?.width
        }
        height={
          draft?.kind === "revision"
            ? draft.source.height
            : draft?.preview?.height
        }
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
