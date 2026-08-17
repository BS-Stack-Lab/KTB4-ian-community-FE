import { fireEvent } from "@testing-library/dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mediaApi } from "../../src/entities/media/api/mediaApi.js";
import { postApi } from "../../src/entities/post/api/postApi.js";
import { EditPostModal } from "../../src/features/post/edit/EditPostModal.jsx";

const legacyPost = {
  postId: 31,
  content: "기존 본문",
  imageUrl: "/images/feed/existing.jpg",
  media: [],
  author: {
    nickname: "작성자",
    profileImage: "/images/profile-default.svg",
  },
};

const v2Post = {
  ...legacyPost,
  imageUrl: "https://cdn.example/landscape.webp",
  media: [
    {
      mediaId: "media-original",
      frame: "POST_LANDSCAPE",
      mediaRevision: 1,
      variants: [
        {
          type: "POST_LANDSCAPE_3X",
          url: "https://cdn.example/landscape.webp",
          width: 1344,
          height: 864,
        },
      ],
    },
  ],
};

describe("피드 수정 Modal", () => {
  let root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.querySelector("#root"));
    URL.createObjectURL = vi.fn(() => "blob:changed-image");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(mediaApi, "initiate").mockResolvedValue({
      mediaId: "media-new",
      upload: { url: "https://upload.example", fields: {} },
    });
    vi.spyOn(mediaApi, "uploadToPresignedPost").mockResolvedValue();
    vi.spyOn(mediaApi, "complete").mockResolvedValue({
      mediaId: "media-new",
      status: "READY",
      variants: [],
    });
  });

  afterEach(async () => {
    await act(() => root.unmount());
    vi.restoreAllMocks();
  });

  async function renderModal(post = legacyPost, props = {}) {
    const onClose = props.onClose ?? vi.fn();
    const onUpdated = props.onUpdated ?? vi.fn(async () => {});
    await act(() =>
      root.render(
        createElement(EditPostModal, {
          open: true,
          post,
          onClose,
          onUpdated,
          ...props,
        }),
      ),
    );
    return { onClose, onUpdated };
  }

  async function chooseAndAttach() {
    const file = new File(["image"], "changed.png", { type: "image/png" });
    await act(async () =>
      fireEvent.change(document.querySelector('input[type="file"]'), {
        target: { files: [file] },
      }),
    );
    expect(document.body.textContent).toContain("이미지 편집");
    await act(async () =>
      fireEvent.click(document.querySelector('[aria-label="이미지 첨부"]')),
    );
    await vi.waitFor(() =>
      expect(document.querySelector(".feed-editor__preview")).not.toBeNull(),
    );
  }

  it("본문 변경만으로 수정할 수 있고 공백 본문은 계속 거부한다", async () => {
    await renderModal();
    const textarea = document.querySelector('[aria-label="피드 본문"]');
    const submit = document.querySelector('[aria-label="피드 수정"]');
    expect(textarea.value).toBe("기존 본문");
    expect(
      document.querySelector(".feed-editor__preview").dataset.previewKind,
    ).toBe("original-legacy");
    expect(submit.disabled).toBe(true);

    await act(() => fireEvent.change(textarea, { target: { value: " " } }));
    expect(submit.disabled).toBe(true);
    await act(() =>
      fireEvent.change(textarea, { target: { value: "수정 본문" } }),
    );
    expect(submit.disabled).toBe(false);
  });

  it("본문을 바꾸지 않아도 이미지 추가·교체·삭제를 변경으로 감지한다", async () => {
    await renderModal();
    await chooseAndAttach();
    expect(
      document.querySelector(".feed-editor__preview").dataset.previewKind,
    ).toBe("new");
    expect(document.querySelector('[aria-label="피드 수정"]').disabled).toBe(
      false,
    );

    await act(() =>
      fireEvent.click(
        document.querySelector('[aria-label="피드 이미지 제거"]'),
      ),
    );
    expect(document.querySelector(".feed-editor__preview")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:changed-image");
    expect(document.querySelector('[aria-label="피드 수정"]').disabled).toBe(
      false,
    );
  });

  it("기존 V2 이미지는 Revision 요청 후 대기 없이 피드에 연결한다", async () => {
    vi.spyOn(mediaApi, "editSource").mockResolvedValue({
      mediaId: "media-original",
      url: "https://private.example/master.webp",
      width: 1600,
      height: 900,
      frame: "POST_LANDSCAPE",
      activeRevision: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      zoom: 1,
      position: { x: 0.5, y: 0.5 },
    });
    vi.spyOn(mediaApi, "createRevision").mockResolvedValue({
      mediaId: "media-original",
      revision: 2,
      status: "PROCESSING",
      variants: [],
    });
    vi.spyOn(postApi, "updateAsyncMedia").mockResolvedValue();
    await renderModal(v2Post);

    await act(async () =>
      fireEvent.click(
        document.querySelector('[aria-label="피드 이미지 편집"]'),
      ),
    );
    await vi.waitFor(() =>
      expect(
        document.querySelector('[aria-label="이미지 첨부"]'),
      ).not.toBeNull(),
    );
    await act(async () =>
      fireEvent.change(
        document.querySelector('[aria-label="이미지 확대 배율"]'),
        { target: { value: "1.5" } },
      ),
    );
    await act(async () =>
      fireEvent.click(document.querySelector('[aria-label="이미지 첨부"]')),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="피드 수정"]')).not.toBeNull(),
    );
    const submit = document.querySelector('[aria-label="피드 수정"]');
    expect(submit.disabled).toBe(false);
    await act(async () => fireEvent.click(submit));

    expect(postApi.updateAsyncMedia).toHaveBeenCalledWith(31, {
      content: "기존 본문",
      mediaIds: ["media-original"],
      revisionTargets: [
        {
          mediaId: "media-original",
          revision: 2,
          operationId: expect.any(String),
        },
      ],
    });
  });

  it("본문 저장 실패 시 입력과 기존 이미지를 유지한다", async () => {
    vi.spyOn(postApi, "update").mockRejectedValue(new Error("수정 실패"));
    const { onClose, onUpdated } = await renderModal();
    const textarea = document.querySelector('[aria-label="피드 본문"]');
    await act(() =>
      fireEvent.change(textarea, { target: { value: "재시도 본문" } }),
    );
    await act(async () =>
      fireEvent.click(document.querySelector('[aria-label="피드 수정"]')),
    );
    expect(document.body.textContent).toContain("수정 실패");
    expect(textarea.value).toBe("재시도 본문");
    expect(document.querySelector(".feed-editor__preview")).not.toBeNull();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
