import { afterEach, describe, expect, it } from "vitest";
import {
  currentRoute,
  navigate,
  profilePathFor,
  sameUserId,
} from "../../src/app/router/navigation.js";

describe("SPA navigation", () => {
  afterEach(() => history.replaceState({}, "", "/"));

  it("Live Server의 index.html을 로그인 진입점으로 해석한다", () => {
    history.replaceState({}, "", "/index.html");

    expect(currentRoute()).toEqual({ name: "login" });
  });

  it("Live Server에서는 새로고침 가능한 hash 경로를 사용한다", () => {
    history.replaceState({}, "", "/index.html");

    navigate("/feed");

    expect(location.pathname).toBe("/index.html");
    expect(location.hash).toBe("#/feed");
    expect(currentRoute()).toEqual({ name: "feed" });
  });

  it("Webpack 개발 서버 경로는 기존 History API 방식을 유지한다", () => {
    history.replaceState({}, "", "/");

    navigate("/posts/15");

    expect(location.pathname).toBe("/posts/15");
    expect(location.hash).toBe("");
    expect(currentRoute()).toEqual({ name: "post", postId: "15" });
  });

  it("회원가입 Route를 해석한다", () => {
    history.replaceState({}, "", "/signup");

    expect(currentRoute()).toEqual({ name: "signup" });
  });

  it("로그인 직접 접근 Route를 해석한다", () => {
    history.replaceState({}, "", "/login");

    expect(currentRoute()).toEqual({ name: "login" });
  });

  it("내 마이페이지와 다른 사용자의 마이페이지 Route를 구분한다", () => {
    history.replaceState({}, "", "/mypage");
    expect(currentRoute()).toEqual({ name: "profile", profileUserId: null });

    history.replaceState({}, "", "/users/24");
    expect(currentRoute()).toEqual({ name: "profile", profileUserId: "24" });

    history.replaceState({}, "", "/users/0");
    expect(currentRoute()).toEqual({ name: "not-found" });
  });

  it("작성자 ID를 인증 사용자 기준 프로필 경로로 변환한다", () => {
    expect(sameUserId("7", 7)).toBe(true);
    expect(profilePathFor(7, "7")).toBe("/mypage");
    expect(profilePathFor(24, 7)).toBe("/users/24");
    expect(profilePathFor(null, 7)).toBeNull();
  });
});
