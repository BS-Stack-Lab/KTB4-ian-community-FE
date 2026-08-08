import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePost } from "../../src/entities/post/model/normalizePost.js";
import {
  httpClient,
  resetHttpClientForTests,
} from "../../src/shared/api/httpClient.js";

const legacyPost = {
  post_id: 31,
  user_id: 7,
  content: "V1 피드 본문",
  image_url: "/images/legacy-feed.jpg",
  nickname: "V1 사용자",
  profile_image: "/images/legacy-profile.jpg",
  like_count: 3,
  comment_count: 1,
  comment: [{ comment_id: 41, comment: "V1 댓글" }],
};

function json(data) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("V1 mock 조회 계약", () => {
  beforeEach(() => {
    resetHttpClientForTests();
    globalThis.__API_BASE_URL__ = "http://api.test";
    globalThis.fetch = vi.fn((url) => {
      const path = new URL(url).pathname;
      if (path === "/api/posts") {
        return Promise.resolve(json({ content: [legacyPost], hasNext: false }));
      }
      if (path === "/api/posts/bookmarks") {
        return Promise.resolve(
          json({
            content: [{ ...legacyPost, bookmark: true }],
            hasNext: false,
          }),
        );
      }
      if (path === "/api/posts/31") {
        return Promise.resolve(json(legacyPost));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
  });

  it("무버전 목록·북마크·상세 경로와 legacy 응답을 유지한다", async () => {
    const list = await httpClient("/api/posts?page=0&size=10");
    const bookmarks = await httpClient("/api/posts/bookmarks?page=0&size=10");
    const detail = await httpClient("/api/posts/31");

    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/posts",
      "/api/posts/bookmarks",
      "/api/posts/31",
    ]);
    expect(normalizePost(list.content[0])).toMatchObject({
      postId: 31,
      content: "V1 피드 본문",
      imageUrl: "/images/legacy-feed.jpg",
      likeCount: 3,
      commentCount: 1,
    });
    expect(normalizePost(bookmarks.content[0]).bookmarked).toBe(true);
    expect(normalizePost(detail).author).toMatchObject({
      userId: 7,
      nickname: "V1 사용자",
      profileImage: "/images/legacy-profile.jpg",
    });
  });
});
