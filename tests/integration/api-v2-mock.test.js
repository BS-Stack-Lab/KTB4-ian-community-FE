import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaApi } from "../../src/entities/media/api/mediaApi.js";
import { normalizeMedia } from "../../src/entities/media/model/mediaModel.js";
import { postApi } from "../../src/entities/post/api/postApi.js";
import { normalizePost } from "../../src/entities/post/model/normalizePost.js";
import { userApi } from "../../src/entities/user/api/userApi.js";
import { resetHttpClientForTests } from "../../src/shared/api/httpClient.js";

const readyMedia = {
  mediaId: "media-v2",
  status: "READY",
  frame: "POST_LANDSCAPE",
  mediaRevision: 2,
  transformVersion: 1,
  variants: [
    {
      type: "POST_LANDSCAPE_1X",
      url: "https://cdn.test/media-v2.r2.t1.448.webp",
      width: 448,
      height: 288,
      mimeType: "image/webp",
      fileSize: 512,
    },
    {
      type: "POST_LANDSCAPE_3X",
      url: "https://cdn.test/media-v2.r2.t1.webp",
      width: 1344,
      height: 864,
      mimeType: "image/webp",
      fileSize: 1024,
    },
  ],
};

const v2Post = {
  postId: 31,
  content: "V2 피드 본문",
  media: [readyMedia],
  author: {
    userId: 7,
    nickname: "V2 사용자",
    legacyProfileImageUrl: "/images/profile.jpg",
  },
  likeCount: 4,
  commentCount: 0,
};

function json(data) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("V2 mock API 계약", () => {
  beforeEach(() => {
    resetHttpClientForTests();
    document.cookie = "XSRF-TOKEN=v2-mock; Path=/";
    globalThis.__API_BASE_URL__ = "http://api.test";
  });

  it("게시글 목록·북마크·상세에서 /api/v2와 Media 응답을 사용한다", async () => {
    globalThis.fetch = vi.fn((url) => {
      const path = new URL(url).pathname;
      if (path === "/api/v2/posts") {
        return Promise.resolve(json({ content: [v2Post], hasNext: false }));
      }
      if (path === "/api/v2/posts/bookmarks") {
        return Promise.resolve(
          json({
            content: [{ ...v2Post, bookmarked: true }],
            hasNext: false,
          }),
        );
      }
      if (path === "/api/v2/posts/31") return Promise.resolve(json(v2Post));
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const list = await postApi.list();
    const bookmarks = await postApi.bookmarks();
    const detail = await postApi.detail(31);

    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/v2/posts",
      "/api/v2/posts/bookmarks",
      "/api/v2/posts/31",
    ]);
    expect(normalizePost(list.content[0])).toMatchObject({
      postId: 31,
      imageUrl: "https://cdn.test/media-v2.r2.t1.448.webp",
      media: [
        expect.objectContaining({ mediaId: "media-v2", mediaRevision: 2 }),
      ],
    });
    expect(normalizePost(bookmarks.content[0]).bookmarked).toBe(true);
    expect(normalizePost(detail).content).toBe("V2 피드 본문");
    expect(
      normalizeMedia(readyMedia).variants.map(({ width }) => width),
    ).toEqual([448, 1344]);
  });

  it("게시글 생성·수정에 mediaIds와 revisionActivations를 전송한다", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await postApi.createV2({ content: "생성 본문", mediaIds: ["media-v2"] });
    await postApi.updateV2(31, {
      content: "수정 본문",
      mediaIds: ["media-v2"],
      revisionActivations: [{ mediaId: "media-v2", revision: 2 }],
    });

    const [createUrl, createOptions] = fetch.mock.calls[0];
    const [updateUrl, updateOptions] = fetch.mock.calls[1];
    expect(createUrl).toBe("http://api.test/api/v2/posts/me");
    expect(createOptions.method).toBe("POST");
    expect(JSON.parse(createOptions.body)).toEqual({
      content: "생성 본문",
      mediaIds: ["media-v2"],
    });
    expect(updateUrl).toBe("http://api.test/api/v2/posts/31");
    expect(updateOptions.method).toBe("PATCH");
    expect(JSON.parse(updateOptions.body)).toEqual({
      content: "수정 본문",
      mediaIds: ["media-v2"],
      revisionActivations: [{ mediaId: "media-v2", revision: 2 }],
    });
  });

  it("Media 업로드·완료·Revision·취소 계약을 분리된 V2 경로로 호출한다", async () => {
    globalThis.fetch = vi.fn((url, options = {}) => {
      const path = new URL(url).pathname;
      if (url === "https://s3.test/upload") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (path === "/api/v2/media/uploads") {
        return Promise.resolve(
          json({
            mediaId: "media-v2",
            status: "PENDING_UPLOAD",
            upload: {
              url: "https://s3.test/upload",
              fields: { key: "private/uploads/media-v2/source" },
            },
          }),
        );
      }
      if (path === "/api/v2/media/media-v2/complete") {
        return Promise.resolve(json(readyMedia));
      }
      if (path === "/api/v2/media/media-v2/edit-source") {
        return Promise.resolve(
          json({
            mediaId: "media-v2",
            url: "https://s3.test/master",
            width: 1600,
            height: 900,
            frame: "POST_LANDSCAPE",
            activeRevision: 1,
            crop: { x: 0, y: 0, width: 1, height: 1 },
            zoom: 1,
            position: { x: 0.5, y: 0.5 },
          }),
        );
      }
      if (
        path === "/api/v2/media/media-v2/revisions" &&
        options.method === "POST"
      ) {
        return Promise.resolve(json({ ...readyMedia, revision: 2 }));
      }
      if (path === "/api/v2/media/media-v2/revisions/2") {
        return options.method === "DELETE"
          ? Promise.resolve(new Response(null, { status: 204 }))
          : Promise.resolve(json({ ...readyMedia, revision: 2 }));
      }
      if (path === "/api/v2/media/media-v2") {
        return options.method === "DELETE"
          ? Promise.resolve(new Response(null, { status: 204 }))
          : Promise.resolve(json(readyMedia));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const initiated = await mediaApi.initiate({
      purpose: "POST",
      fileName: "feed.jpg",
      contentType: "image/jpeg",
      fileSize: 1024,
      frame: "POST_LANDSCAPE",
      rotation: 0,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      zoom: 1,
      position: { x: 0.5, y: 0.5 },
    });
    const file = new File(["image"], "feed.jpg", { type: "image/jpeg" });
    await mediaApi.uploadToPresignedPost(file, initiated.upload);
    expect(normalizeMedia(await mediaApi.complete("media-v2"))).toMatchObject({
      mediaId: "media-v2",
      status: "READY",
    });
    await mediaApi.get("media-v2");
    await mediaApi.editSource("media-v2");
    await mediaApi.createRevision("media-v2", {
      frame: "POST_LANDSCAPE",
      crop: { x: 0, y: 0, width: 1, height: 1 },
      zoom: 1.5,
      position: { x: 0.5, y: 0.5 },
    });
    await mediaApi.getRevision("media-v2", 2);
    await mediaApi.cancelRevision("media-v2", 2);
    await mediaApi.cancel("media-v2");

    const calls = fetch.mock.calls.map(([url, options = {}]) => ({
      path: new URL(url).pathname,
      method: options.method || "GET",
    }));
    expect(calls).toEqual([
      { path: "/api/v2/media/uploads", method: "POST" },
      { path: "/upload", method: "POST" },
      { path: "/api/v2/media/media-v2/complete", method: "POST" },
      { path: "/api/v2/media/media-v2", method: "GET" },
      { path: "/api/v2/media/media-v2/edit-source", method: "POST" },
      { path: "/api/v2/media/media-v2/revisions", method: "POST" },
      { path: "/api/v2/media/media-v2/revisions/2", method: "GET" },
      { path: "/api/v2/media/media-v2/revisions/2", method: "DELETE" },
      { path: "/api/v2/media/media-v2", method: "DELETE" },
    ]);
    const uploadBody = fetch.mock.calls[1][1].body;
    expect(uploadBody).toBeInstanceOf(FormData);
    expect(uploadBody.get("key")).toBe("private/uploads/media-v2/source");
    expect(uploadBody.get("file")).toBe(file);
  });

  it("프로필 Media 조회·변경도 /api/v2/users 경로를 사용한다", async () => {
    const profileMedia = {
      ...readyMedia,
      frame: "PROFILE",
      variants: [
        {
          type: "PROFILE_MEDIUM",
          url: "https://cdn.test/profile.r1.t1.webp",
          width: 160,
          height: 160,
          mimeType: "image/webp",
          fileSize: 512,
        },
      ],
    };
    globalThis.fetch = vi.fn((url, options = {}) => {
      const path = new URL(url).pathname;
      if (path === "/api/v2/users/7/profile-image") {
        return Promise.resolve(json(profileMedia));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    await userApi.profileMedia(7);
    await userApi.updateProfileMedia(7, "media-v2");

    const [getUrl, getOptions] = fetch.mock.calls[0];
    const [patchUrl, patchOptions] = fetch.mock.calls[1];
    expect(getUrl).toBe("http://api.test/api/v2/users/7/profile-image");
    expect(getOptions.method).toBe("GET");
    expect(patchUrl).toBe("http://api.test/api/v2/users/7/profile-image");
    expect(patchOptions.method).toBe("PATCH");
    expect(JSON.parse(patchOptions.body)).toEqual({ mediaId: "media-v2" });
  });
});
