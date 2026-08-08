import { fireEvent } from "@testing-library/dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userApi } from "../../src/entities/user/api/userApi.js";
import { EditProfileModal } from "../../src/features/user/profile/EditProfileModal.jsx";
import { mediaApi } from "../../src/entities/media/api/mediaApi.js";

const user = {
  userId: 7,
  email: "profile@example.com",
  nickname: "기존닉",
  profileImage: "/images/profile-default.svg",
};

describe("프로필 편집 Modal", () => {
  let root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.querySelector("#root"));
    URL.createObjectURL = vi.fn(() => "blob:profile-preview");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(mediaApi, "initiate").mockResolvedValue({
      mediaId: "profile-media-1",
      upload: { url: "https://upload.example", fields: {} },
    });
    vi.spyOn(mediaApi, "uploadToPresignedPost").mockResolvedValue();
    vi.spyOn(mediaApi, "complete").mockResolvedValue({
      mediaId: "profile-media-1",
      status: "READY",
      variants: [],
    });
  });

  afterEach(async () => {
    await act(() => root.unmount());
    vi.restoreAllMocks();
  });

  async function renderModal(props = {}) {
    const onClose = props.onClose ?? vi.fn();
    const onUpdated = props.onUpdated ?? vi.fn();
    const onDeleteAccount = props.onDeleteAccount ?? vi.fn();
    await act(() =>
      root.render(
        createElement(EditProfileModal, {
          open: true,
          user,
          onClose,
          onUpdated,
          onDeleteAccount,
          ...props,
        }),
      ),
    );
    return { onClose, onUpdated, onDeleteAccount };
  }

  it("현재 사용자와 160px 이미지를 표시하고 실제 변경만 활성화한다", async () => {
    await renderModal();
    const nickname = document.querySelector('[aria-label="닉네임"]');
    const save = document.querySelector(".profile-editor__fields button");
    const avatar = document.querySelector(
      ".profile-editor__avatar .user-avatar",
    );
    expect(document.querySelector('[aria-label="이메일"]').value).toBe(
      user.email,
    );
    expect(nickname.value).toBe(user.nickname);
    expect(avatar.getAttribute("width")).toBe("160");
    expect(avatar.getAttribute("height")).toBe("160");
    expect(save.disabled).toBe(true);
    await act(() => fireEvent.change(nickname, { target: { value: " " } }));
    expect(save.disabled).toBe(true);
    await act(() =>
      fireEvent.change(nickname, { target: { value: "새닉네임" } }),
    );
    expect(save.disabled).toBe(false);
  });

  it("회원탈퇴 Trigger를 상위 Session Confirm 흐름에 전달한다", async () => {
    const { onDeleteAccount } = await renderModal();
    await act(() =>
      fireEvent.click(document.querySelector(".profile-editor__delete")),
    );
    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("이미지 Preview를 표시하고 성공 후 사용자와 Object URL을 갱신한다", async () => {
    vi.spyOn(userApi, "updateProfileMedia").mockResolvedValue({
      mediaId: "profile-media-1",
      status: "READY",
      variants: [
        {
          type: "PROFILE_MEDIUM",
          url: "https://cdn.example/profile-160.webp",
          width: 160,
          height: 160,
        },
      ],
    });
    const { onClose, onUpdated } = await renderModal();
    const file = new File(["image"], "profile.png", { type: "image/png" });
    await act(() =>
      fireEvent.change(document.querySelector('input[type="file"]'), {
        target: { files: [file] },
      }),
    );
    expect(document.querySelector(".user-avatar").src).toBe(
      "blob:profile-preview",
    );
    await act(async () =>
      fireEvent.click(document.querySelector(".profile-editor__fields button")),
    );
    expect(userApi.updateProfileMedia).toHaveBeenCalledWith(
      7,
      "profile-media-1",
    );
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: "기존닉",
        profileImage: "https://cdn.example/profile-160.webp",
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:profile-preview");
  });

  it("Pending 중 중복 요청을 막고 실패하면 입력과 Preview를 유지한다", async () => {
    let reject;
    vi.spyOn(userApi, "updateProfileMedia").mockReturnValue(
      new Promise((resolve, rejectRequest) => {
        reject = rejectRequest;
      }),
    );
    const { onClose, onUpdated } = await renderModal();
    const file = new File(["image"], "profile.png", { type: "image/png" });
    await act(() =>
      fireEvent.change(document.querySelector('input[type="file"]'), {
        target: { files: [file] },
      }),
    );
    const save = document.querySelector(".profile-editor__fields button");
    await act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
      fireEvent.click(save);
    });
    await vi.waitFor(() =>
      expect(userApi.updateProfileMedia).toHaveBeenCalledTimes(1),
    );
    await act(async () => reject(new Error("프로필 수정 실패")));
    expect(document.body.textContent).toContain("프로필 수정 실패");
    expect(document.querySelector(".user-avatar").src).toBe(
      "blob:profile-preview",
    );
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
