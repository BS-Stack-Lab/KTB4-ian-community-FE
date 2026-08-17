import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePost } from "../../src/entities/post/model/normalizePost.js";
import { PostCard } from "../../src/entities/post/ui/PostCard.jsx";

describe("Feed Card", () => {
  let container;
  let root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    container = document.querySelector("#root");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(() => root.unmount());
  });

  async function renderCard(overrides = {}, props = {}) {
    const post = normalizePost({
      post_id: 7,
      content: "선택 가능한 피드 본문",
      image_url: "/images/post.jpg",
      nickname: "작성자",
      view_count: 12_345,
      like_count: 12_345,
      comment_count: 1_240,
      created_at: "2026-07-23T12:00:00.000Z",
      ...overrides,
    });
    await act(() => root.render(createElement(PostCard, { post, ...props })));
    return post;
  }

  it("Figma 순서와 숫자 표기로 작성자·이미지·본문·Action을 렌더링한다", async () => {
    await renderCard();
    const body = container.querySelector(".post-card__body");
    expect([...body.children].map((node) => node.tagName)).toEqual([
      "HEADER",
      "DIV",
      "P",
    ]);
    expect(
      container.querySelector(".post-card__metadata").textContent,
    ).toContain("조회 1.2만");
    expect(getByRole(container, "button", { name: "좋아요" }).textContent).toBe(
      "1.2만",
    );
    expect(container.querySelector(".post-action-label").textContent).toBe(
      "1,240",
    );
  });

  it("첨부 이미지는 drag를 막되 카드 클릭과 본문 선택을 유지한다", async () => {
    const onOpen = vi.fn();
    await renderCard({}, { onOpen });
    const image = container.querySelector(".post-card__image");
    expect(image.draggable).toBe(false);
    expect(fireEvent.dragStart(image)).toBe(false);
    expect(container.querySelector(".post-card__content").textContent).toBe(
      "선택 가능한 피드 본문",
    );
    await act(() => fireEvent.click(image));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("이미지가 없으면 Preview DOM을 렌더링하지 않는다", async () => {
    await renderCard({ image_url: null });
    expect(container.querySelector(".post-card__image")).toBeNull();
  });

  it("V2 variant는 srcset을 사용하고 LCP 후보만 eager/high priority로 로드한다", async () => {
    await renderCard(
      {
        media: [
          {
            mediaId: "media-1",
            status: "READY",
            variants: [
              { url: "https://cdn/448.webp", width: 448, height: 288 },
              { url: "https://cdn/896.webp", width: 896, height: 576 },
            ],
          },
        ],
      },
      { imagePriority: true },
    );
    const image = container.querySelector(".post-card__image");
    expect(image.getAttribute("srcset")).toContain("448w");
    expect(image.getAttribute("sizes")).toBe("(max-width: 448px) 100vw, 448px");
    expect(image.getAttribute("loading")).toBe("eager");
    expect(image.getAttribute("fetchpriority")).toBe("high");

    await renderCard({ post_id: 8 }, { imagePriority: false });
    expect(
      container.querySelector(".post-card__image").getAttribute("loading"),
    ).toBe("lazy");
  });

  it("Feed 소유자 Action은 하단 북마크 위치의 Option Menu로 제공한다", async () => {
    await renderCard(
      {},
      {
        onBookmark: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        ownerOptionsInFooter: true,
      },
    );
    const trigger = getByRole(container, "button", { name: "피드 옵션" });
    expect(trigger.closest(".post-actions")).toBeTruthy();
    expect(container.querySelector(".post-actions__bookmark")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await act(() => fireEvent.click(trigger));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(getByRole(container, "menu")).toBeTruthy();
    expect(container.textContent).toContain("저장하기");
    expect(container.textContent).toContain("수정하기");
    expect(container.textContent).toContain("삭제하기");
    await act(() => fireEvent.click(trigger));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("타인 글은 기존 하단 북마크 위치를 유지한다", async () => {
    await renderCard({}, { onBookmark: vi.fn() });
    const bookmark = getByRole(container, "button", { name: "북마크" });
    expect(bookmark.closest(".post-actions")).toBeTruthy();
    expect(container.querySelector('[aria-label="피드 옵션"]')).toBeNull();
  });

  it("Footer Modifier가 없으면 기존 상단 소유자 메뉴를 유지한다", async () => {
    await renderCard({}, { onEdit: vi.fn(), onDelete: vi.fn() });
    const trigger = getByRole(container, "button", { name: "피드 옵션" });
    expect(trigger.closest(".post-card__header")).toBeTruthy();
    await act(() => fireEvent.click(trigger));
    expect(container.textContent).not.toContain("저장하기");
    expect(container.textContent).toContain("수정하기");
    expect(container.textContent).toContain("삭제하기");
  });
});
