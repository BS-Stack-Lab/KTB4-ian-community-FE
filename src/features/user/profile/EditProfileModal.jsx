import { useEffect, useRef, useState } from "react";
import { userApi } from "../../../entities/user/api/userApi.js";
import { UserAvatar } from "../../../entities/user/ui/UserAvatar.jsx";
import { backLeftIcon, cameraIcon } from "../../../shared/assets/index.js";
import { Modal } from "../../../shared/ui/Modal.jsx";
import { ImageEditor } from "../../media/ui/ImageEditor.jsx";
import {
  createOrientedPreview,
  defaultNormalizedCrop,
} from "../../media/lib/imagePreview.js";
import { uploadMedia } from "../../media/model/mediaOrchestrator.js";
import {
  normalizeMedia,
  preferredVariant,
} from "../../../entities/media/model/mediaModel.js";
import { mediaApi } from "../../../entities/media/api/mediaApi.js";
import { useReloadBlocker } from "../../../shared/update/useReloadBlocker.js";

export function EditProfileModal({
  open,
  onClose,
  user,
  onUpdated,
  onDeleteAccount,
}) {
  const [nickname, setNickname] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState(null);
  const [preparedMedia, setPreparedMedia] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const pendingRef = useRef(false);
  const nicknameValue = nickname.trim();
  const nicknameValid = nicknameValue.length >= 1 && nicknameValue.length <= 10;
  const nicknameChanged = nicknameValue !== user.nickname;
  const valid = nicknameValid && (nicknameChanged || Boolean(file)) && !pending;
  useReloadBlocker(
    "edit-profile",
    open &&
      Boolean(nicknameChanged || file || preview || preparedMedia || pending),
  );

  useEffect(() => {
    if (!open) return;
    setNickname(user.nickname);
    setFile(null);
    setPreview(null);
    setEdit(null);
    setPreparedMedia(null);
    setPending(false);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }, [open, user.nickname, user.profileImage]);

  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  async function choose(event) {
    const next = event.target.files[0] || null;
    if (!next) return;
    if (next.size > 1024 * 1024) {
      setError("프로필 이미지는 1MiB 이하만 업로드할 수 있습니다.");
      return;
    }
    try {
      const nextPreview = await createOrientedPreview(next);
      setFile(next);
      setPreview(nextPreview);
      setPreparedMedia(null);
      setEdit({
        purpose: "PROFILE",
        frame: "PROFILE",
        rotation: 0,
        crop: defaultNormalizedCrop(nextPreview.width, nextPreview.height, 1),
      });
      setError("");
    } catch (cause) {
      setError(cause.message || "이미지 미리보기를 만들 수 없습니다.");
    }
  }

  function cancelImage() {
    if (preparedMedia?.mediaId) {
      mediaApi.cancel(preparedMedia.mediaId).catch(() => {});
    }
    setFile(null);
    setPreview(null);
    setEdit(null);
    setPreparedMedia(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function cancelAndClose() {
    cancelImage();
    onClose();
  }

  async function submit() {
    if (!valid || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      let profileImage = user.profileImage;
      let profileMedia = user.profileMedia ?? null;
      if (file) {
        let media = preparedMedia;
        if (!media) {
          media = await uploadMedia(file, edit);
          setPreparedMedia(media);
        }
        const result = await userApi.updateProfileMedia(
          user.userId,
          media.mediaId,
        );
        profileMedia = normalizeMedia(result);
        profileImage = preferredVariant(profileMedia, 160)?.url ?? profileImage;
      }
      if (nicknameChanged)
        await userApi.updateNickname(user.userId, nicknameValue);
      onUpdated({ nickname: nicknameValue, profileImage, profileMedia });
      setPreview(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
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
      title="프로필 편집"
      onClose={pending ? undefined : cancelAndClose}
      className="profile-edit-modal"
    >
      <header className="profile-edit-header">
        <button
          type="button"
          aria-label="프로필 편집 닫기"
          onClick={cancelAndClose}
        >
          <img src={backLeftIcon} alt="" />
        </button>
        <strong>프로필 편집</strong>
      </header>
      <section className="profile-editor">
        <label className="profile-editor__avatar">
          <UserAvatar
            profileImage={preview?.url || user.profileImage}
            profileMedia={preview ? null : user.profileMedia}
            nickname={user.nickname}
            size={160}
          />
          <span>
            <img src={cameraIcon} alt="프로필 이미지 선택" />
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp,.jpg,.jpeg,.png,.webp,.bmp"
            onChange={choose}
            disabled={pending}
          />
        </label>
        {preview?.width && (
          <ImageEditor
            source={preview.url}
            purpose="PROFILE"
            width={preview.width}
            height={preview.height}
            initialFrame="PROFILE"
            disabled={pending}
            onChange={setEdit}
          />
        )}
        {preview && (
          <button
            className="profile-editor__cancel-image"
            type="button"
            onClick={cancelImage}
            disabled={pending}
          >
            이미지 업로드 취소
          </button>
        )}
        <div className="profile-editor__fields">
          <input aria-label="이메일" value={user.email} readOnly />
          <input
            aria-label="닉네임"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            disabled={pending}
          />
          <button
            className="button button--primary"
            type="button"
            disabled={!valid}
            onClick={submit}
          >
            {pending ? "저장 중" : "저장하기"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <button
          className="profile-editor__delete"
          type="button"
          onClick={onDeleteAccount}
          disabled={pending}
        >
          회원탈퇴
        </button>
      </section>
    </Modal>
  );
}
