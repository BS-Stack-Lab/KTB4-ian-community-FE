import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityLnb } from "../../src/app/layouts/CommunityLnb.jsx";

const user = {
  userId: 7,
  nickname: "아주 긴 사용자 닉네임",
  profileImage: "/images/me.svg",
};

describe("Community LNB", () => {
  let root;
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    container = document.querySelector("#root");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(() => root.unmount());
  });

  async function renderLnb(overrides = {}) {
    const callbacks = {
      onFeed: vi.fn(),
      onCreate: vi.fn(),
      onBookmarks: vi.fn(),
      onMyPage: vi.fn(),
      onProfile: vi.fn(),
      onPassword: vi.fn(),
      onLogout: vi.fn(),
    };
    await act(() =>
      root.render(
        createElement(CommunityLnb, {
          routeName: "feed",
          user,
          createOpen: false,
          profileOpen: false,
          passwordOpen: false,
          ...callbacks,
          ...overrides,
        }),
      ),
    );
    return callbacks;
  }

  it("Figma 메뉴 순서와 실제 SVG 아이콘을 렌더링한다", async () => {
    await renderLnb();
    const items = [...container.querySelectorAll(".lnb-navigation__item")];
    expect(items.map((item) => item.textContent.trim())).toEqual([
      "피드",
      "새로운 피드 작성",
      "북마크",
      "마이페이지",
      "프로필 편집",
      "비밀번호 변경",
    ]);
    expect(container.querySelector(".lnb-account__label").textContent).toBe(
      "회원정보",
    );
    for (const item of items) {
      const icons = [...item.querySelectorAll(".lnb-icon img")];
      expect(icons.length).toBeGreaterThan(0);
      expect(
        icons.every((icon) => {
          const source = icon.getAttribute("src");
          return (
            source.startsWith("data:image/svg+xml") || source.endsWith(".svg")
          );
        }),
      ).toBe(true);
      expect(
        icons.every((icon) => icon.getAttribute("aria-hidden") === "true"),
      ).toBe(true);
    }
    expect(container.textContent).not.toMatch(/[🏠🔖➕🔒👤]/u);
  });

  it("Route와 Modal 상태를 aria-current와 aria-pressed로 구분한다", async () => {
    await renderLnb({ routeName: "post", createOpen: true });
    expect(
      getByRole(container, "button", { name: "피드" }).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
    expect(
      getByRole(container, "button", {
        name: "새로운 피드 작성",
      }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      getByRole(container, "button", { name: "북마크" }).hasAttribute(
        "aria-current",
      ),
    ).toBe(false);

    await renderLnb({ routeName: "bookmarks", profileOpen: true });
    expect(
      getByRole(container, "button", { name: "북마크" }).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
    expect(
      getByRole(container, "button", { name: "프로필 편집" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");

    await renderLnb({ routeName: "profile" });
    expect(
      getByRole(container, "button", { name: "마이페이지" }).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
  });

  it("Navigation Callback과 실제 사용자 정보를 연결한다", async () => {
    const callbacks = await renderLnb();
    for (const [name, callback] of [
      ["피드", callbacks.onFeed],
      ["새로운 피드 작성", callbacks.onCreate],
      ["북마크", callbacks.onBookmarks],
      ["마이페이지", callbacks.onMyPage],
      ["프로필 편집", callbacks.onProfile],
      ["비밀번호 변경", callbacks.onPassword],
      ["로그아웃", callbacks.onLogout],
    ]) {
      await act(() =>
        fireEvent.click(getByRole(container, "button", { name })),
      );
      expect(callback).toHaveBeenCalledTimes(1);
    }
    const nickname = container.querySelector(".lnb-user__identity strong");
    expect(nickname.textContent).toBe(user.nickname);
    expect(nickname.getAttribute("title")).toBe(user.nickname);
    await act(() =>
      fireEvent.click(
        getByRole(container, "button", { name: "내 프로필 보기" }),
      ),
    );
    expect(callbacks.onMyPage).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector(".lnb-user .user-avatar").getAttribute("alt"),
    ).toBe(`${user.nickname} 프로필`);
  });
});
