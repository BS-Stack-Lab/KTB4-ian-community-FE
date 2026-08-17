import { fireEvent } from "@testing-library/dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mediaApi } from "../../src/entities/media/api/mediaApi.js";
import { postApi } from "../../src/entities/post/api/postApi.js";
import { CreatePostModal } from "../../src/features/post/create/CreatePostModal.jsx";

const user = {
  userId: 7,
  nickname: "작성자",
  profileImage: "/images/profile-default.svg",
};

describe("피드 생성 Modal", () => {
  let root;
  let objectIndex;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.querySelector("#root"));
    objectIndex = 0;
    URL.createObjectURL = vi.fn(() => `blob:preview-${++objectIndex}`);
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(mediaApi, "initiate").mockResolvedValue({
      mediaId: "media-1",
      upload: { url: "https://upload.example", fields: {} },
    });
    vi.spyOn(mediaApi, "uploadToPresignedPost").mockResolvedValue();
    vi.spyOn(mediaApi, "complete").mockResolvedValue({
      mediaId: "media-1",
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
    const onCreated = props.onCreated ?? vi.fn(async () => {});
    await act(() =>
      root.render(
        createElement(CreatePostModal, {
          open: true,
          user,
          onClose,
          onCreated,
          ...props,
        }),
      ),
    );
    return { onClose, onCreated };
  }

  async function chooseAndAttach(file) {
    await act(async () =>
      fireEvent.change(document.querySelector('input[type="file"]'), {
        target: { files: [file] },
      }),
    );
    expect(document.body.textContent).toContain("이미지 편집");
    expect(document.querySelector('[aria-label="피드 게시"]')).toBeNull();
    await act(async () =>
      fireEvent.click(document.querySelector('[aria-label="이미지 첨부"]')),
    );
    await vi.waitFor(() =>
      expect(document.querySelector(".feed-editor__preview")).not.toBeNull(),
    );
  }

  it("새 이미지 확인 전에는 첨부하지 않고 본문을 필수로 유지한다", async () => {
    await renderModal();
    const file = new File(["image"], "photo.png", { type: "image/png" });
    expect(document.querySelector('[aria-label="피드 게시"]').disabled).toBe(
      true,
    );

    await act(async () =>
      fireEvent.change(document.querySelector('input[type="file"]'), {
        target: { files: [file] },
      }),
    );
    expect(document.querySelector(".feed-editor__preview")).toBeNull();
    await act(() =>
      fireEvent.click(
        document.querySelector(".feed-image-edit-modal__header button"),
      ),
    );
    expect(document.querySelector(".feed-editor__preview")).toBeNull();
    expect(mediaApi.initiate).not.toHaveBeenCalled();

    await chooseAndAttach(file);
    const previewImage = document.querySelector(
      '[alt="선택한 이미지 미리보기"]',
    );
    expect(previewImage.draggable).toBe(false);
    const textarea = document.querySelector('[aria-label="피드 본문"]');
    await act(() => fireEvent.change(textarea, { target: { value: "본문" } }));
    expect(document.querySelector('[aria-label="피드 게시"]').disabled).toBe(
      false,
    );
  });

  it("첨부 준비 후 게시 요청은 중복 실행하지 않고 성공 시 정리한다", async () => {
    let finish;
    vi.spyOn(postApi, "createAsyncMedia").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { onClose, onCreated } = await renderModal();
    await chooseAndAttach(
      new File(["image"], "photo.png", { type: "image/png" }),
    );
    const textarea = document.querySelector('[aria-label="피드 본문"]');
    await act(() =>
      fireEvent.change(textarea, { target: { value: "  본문  " } }),
    );
    const submit = document.querySelector('[aria-label="피드 게시"]');

    await act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    expect(postApi.createAsyncMedia).toHaveBeenCalledTimes(1);
    expect(postApi.createAsyncMedia).toHaveBeenCalledWith({
      content: "본문",
      mediaIds: ["media-1"],
    });
    expect(submit.disabled).toBe(true);

    await act(async () => finish());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("게시 API 실패 후 본문과 준비된 Preview를 유지한다", async () => {
    vi.spyOn(postApi, "createAsyncMedia").mockRejectedValueOnce(
      new Error("생성 실패"),
    );
    await renderModal();
    await chooseAndAttach(
      new File(["image"], "photo.png", { type: "image/png" }),
    );
    const textarea = document.querySelector('[aria-label="피드 본문"]');
    await act(() =>
      fireEvent.change(textarea, { target: { value: "재시도" } }),
    );
    await act(async () =>
      fireEvent.click(document.querySelector('[aria-label="피드 게시"]')),
    );

    expect(document.body.textContent).toContain("생성 실패");
    expect(textarea.value).toBe("재시도");
    expect(document.querySelector(".feed-editor__preview")).not.toBeNull();
    expect(document.querySelector('[aria-label="피드 게시"]').disabled).toBe(
      false,
    );
  });
});
