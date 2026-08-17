import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeUserProfile } from "../../src/entities/user/model/normalizeUserProfile.js";
import { ProfileHeader } from "../../src/entities/user/ui/ProfileHeader.jsx";

describe("사용자 프로필", () => {
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

  it("서버 DTO를 세 ProfileHeader 상태와 비동기 count로 정규화한다", () => {
    expect(
      normalizeUserProfile({
        user_id: 24,
        nickname: "dlkfjls",
        follower_count: "23000",
        following_count: 24,
        count_updated_at: "2026-08-16T14:20:31",
        profile_type: "OTHER_FOLLOWING",
      }),
    ).toMatchObject({
      userId: 24,
      nickname: "dlkfjls",
      followerCount: 23000,
      followingCount: 24,
      countUpdatedAt: "2026-08-16T14:20:31",
      profileType: "OTHER_FOLLOWING",
    });
  });

  it("Self에서는 관계 버튼을 숨기고 Figma 통계를 렌더링한다", async () => {
    await act(() =>
      root.render(
        createElement(ProfileHeader, {
          profile: {
            nickname: "dlkfjls",
            profileType: "SELF",
            followerCount: 23000,
            followingCount: 24,
          },
          onBack: vi.fn(),
        }),
      ),
    );
    expect(container.textContent).toContain("팔로워2.3만명");
    expect(container.textContent).toContain("팔로잉24명");
    expect(
      container.querySelector(".profile-header__follow-button"),
    ).toBeNull();
  });

  it("Other 상태를 팔로우/팔로잉 버튼으로 표현한다", async () => {
    const onToggleFollow = vi.fn();
    const profile = {
      nickname: "other",
      profileType: "OTHER_NOT_FOLLOWING",
      followerCount: 1,
      followingCount: 2,
    };
    await act(() =>
      root.render(
        createElement(ProfileHeader, {
          profile,
          onBack: vi.fn(),
          onToggleFollow,
        }),
      ),
    );
    const button = getByRole(container, "button", { name: "팔로우" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await act(() => fireEvent.click(button));
    expect(onToggleFollow).toHaveBeenCalledOnce();

    await act(() =>
      root.render(
        createElement(ProfileHeader, {
          profile: { ...profile, profileType: "OTHER_FOLLOWING" },
          onBack: vi.fn(),
          onToggleFollow,
        }),
      ),
    );
    expect(
      getByRole(container, "button", { name: "팔로잉" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });
});
