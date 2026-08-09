import { expect, test } from "@playwright/test";

async function prepare(
  page,
  { postUserId = 7, liked = false, likeCount = 3 } = {},
) {
  const state = {
    liked,
    likeCount,
    bookmarked: false,
    likeRequests: [],
    bookmarkRequests: [],
    failNextLike: false,
    failNextBookmark: false,
  };
  const cors = {
    "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-XSRF-TOKEN",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
  const responsePost = () => ({
    post_id: 1,
    user_id: postUserId,
    content: "상호작용 피드",
    nickname: "현재 사용자",
    profile_image: "/images/profile.svg",
    like_count: state.likeCount,
    liked: state.liked,
    bookmarked: state.bookmarked,
    comment_count: 0,
    view_count: 0,
    created_at: "2026-07-29T10:00:00Z",
    comment: [],
  });

  await page.context().addCookies([
    { name: "accessToken", value: "test-access", url: "http://127.0.0.1:8080" },
    { name: "XSRF-TOKEN", value: "csrf-token", url: "http://127.0.0.1:8080" },
  ]);
  await page.addInitScript(() => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "현재 사용자" }),
    );
  });
  await page.route("http://127.0.0.1:8080/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          data: {
            user_id: 7,
            email: "current@example.com",
            nickname: "현재 사용자",
            profile_image: "/images/profile.svg",
          },
        },
        headers: cors,
      });
    if (url.pathname.endsWith(".svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: "<svg xmlns='http://www.w3.org/2000/svg'/>",
        headers: cors,
      });
    if (
      request.method() === "GET" &&
      (url.pathname === "/api/v2/posts" ||
        url.pathname === "/api/v2/posts/bookmarks")
    )
      return route.fulfill({
        json: {
          data: {
            content: [
              {
                ...responsePost(),
                bookmarked:
                  url.pathname === "/api/v2/posts/bookmarks" ||
                  state.bookmarked,
              },
            ],
            page: 0,
            size: 10,
            hasNext: false,
            message: "더 이상 조회할 피드가 없습니다.",
          },
        },
        headers: cors,
      });
    if (request.method() === "GET" && url.pathname === "/api/v2/posts/1")
      return route.fulfill({ json: { data: responsePost() }, headers: cors });

    const record = {
      method: request.method(),
      csrf: request.headers()["x-xsrf-token"],
      cookie: request.headers().cookie || "",
    };
    if (url.pathname === "/api/posts/1/likes" && request.method() === "POST") {
      state.likeRequests.push(record);
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (state.failNextLike) {
        state.failNextLike = false;
        return route.fulfill({
          status: 500,
          json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
          headers: cors,
        });
      }
      state.liked = !state.liked;
      state.likeCount += state.liked ? 1 : -1;
      return route.fulfill({
        json: { data: { liked: state.liked, likeCount: state.likeCount } },
        headers: cors,
      });
    }
    if (
      url.pathname === "/api/posts/1/bookmarks" &&
      (request.method() === "POST" || request.method() === "DELETE")
    ) {
      state.bookmarkRequests.push(record);
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (state.failNextBookmark) {
        state.failNextBookmark = false;
        return route.fulfill({
          status: 500,
          json: {
            code: "BOOKMARK_OPERATION_FAILED",
            message: "internal detail",
          },
          headers: cors,
        });
      }
      state.bookmarked = request.method() === "POST";
      if (request.method() === "DELETE")
        return route.fulfill({ status: 204, headers: cors });
      return route.fulfill({
        json: { data: { postId: 1, bookmarked: true } },
        headers: cors,
      });
    }
    return route.fulfill({ status: 204, headers: cors });
  });
  return state;
}

function card(page) {
  return page.locator(".post-card").first();
}

test("피드 좋아요는 상세 왕복 후 아이콘과 수를 유지하고 바로 취소된다", async ({
  page,
}) => {
  const state = await prepare(page, { likeCount: 0 });
  await page.goto("/feed");

  const feedLike = card(page).getByRole("button", { name: "좋아요" });
  await feedLike.click();
  await expect(feedLike).toBeEnabled();
  await expect(feedLike).toHaveAttribute("aria-pressed", "true");
  await expect(feedLike).toHaveText("1");

  await card(page).locator(".post-card__body").click();
  await expect(page).toHaveURL(/\/posts\/1$/);
  await expect(
    card(page).getByRole("button", { name: "좋아요" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "뒤로가기" }).click();
  await expect(page).toHaveURL(/\/feed$/);

  const returnedLike = card(page).getByRole("button", { name: "좋아요" });
  await expect(returnedLike).toHaveAttribute("aria-pressed", "true");
  await expect(returnedLike).toHaveText("1");
  await expect(returnedLike.locator("img")).toHaveAttribute(
    "src",
    /heart-fill\.[0-9a-f]{12}\.svg$/,
  );

  await returnedLike.click();
  await expect(returnedLike).toBeDisabled();
  await expect(returnedLike).toHaveAttribute("aria-pressed", "false");
  await expect(returnedLike).toHaveText("0");
  await expect(returnedLike).toBeEnabled();
  expect(state.likeRequests).toHaveLength(2);
});

test("북마크에서도 좋아요 수와 heart 아이콘을 토글한다", async ({ page }) => {
  const state = await prepare(page, { likeCount: 10 });
  await page.goto("/bookmarks");

  const like = card(page).getByRole("button", { name: "좋아요" });
  await expect(like).toBeEnabled();
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(like).toHaveText("10");
  await expect(like.locator("img")).toHaveAttribute(
    "src",
    /heart-stroke\.[0-9a-f]{12}\.svg$/,
  );

  await like.click();
  await expect(like).toBeDisabled();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(like).toHaveText("11");
  await expect(like.locator("img")).toHaveAttribute(
    "src",
    /heart-fill\.[0-9a-f]{12}\.svg$/,
  );
  await expect(like).toBeEnabled();

  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(like).toHaveText("10");
  await expect(like.locator("img")).toHaveAttribute(
    "src",
    /heart-stroke\.[0-9a-f]{12}\.svg$/,
  );
  await expect(like).toBeEnabled();
  expect(state.likeRequests).toHaveLength(2);
});

for (const [name, path] of [
  ["피드", "/feed"],
  ["상세", "/posts/1"],
]) {
  test(`${name} 좋아요는 단일 요청·서버 확정·롤백·재시도를 보장한다`, async ({
    page,
  }) => {
    const state = await prepare(page);
    await page.goto(path);
    const like = card(page).getByRole("button", { name: "좋아요" });
    await expect(like).toHaveAttribute("aria-pressed", "false");

    await like.click();
    await expect(like).toBeDisabled();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(like).toHaveText("4");
    expect(state.likeRequests).toHaveLength(1);
    expect(state.likeRequests[0]).toMatchObject({
      method: "POST",
      csrf: "csrf-token",
    });
    expect(state.likeRequests[0].cookie).toContain("accessToken=test-access");

    state.failNextLike = true;
    await like.click();
    await expect(page.getByText("서버 오류가 발생했습니다.")).toBeVisible();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(like).toHaveText("4");
    await expect(like).toBeEnabled();

    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "false");
    await expect(like).toHaveText("3");
    expect(state.likeRequests).toHaveLength(3);
  });

  test(`${name} 북마크는 SVG·aria 상태를 저장·재조회·삭제하고 실패 후 재시도한다`, async ({
    page,
  }) => {
    const state = await prepare(page, { postUserId: 8 });
    await page.goto(path);
    const bookmark = card(page).getByRole("button", { name: "북마크" });
    const icon = bookmark.locator("img");

    await expect(bookmark).toHaveAttribute("aria-pressed", "false");
    await expect(icon).toHaveAttribute(
      "src",
      /receipt-stroke-vector\.[0-9a-f]{12}\.svg$/,
    );
    await bookmark.click();
    await expect(bookmark).toBeDisabled();
    await expect(bookmark).toHaveAttribute("aria-pressed", "true");
    await expect(icon).toHaveAttribute(
      "src",
      /receipt-fill-vector\.[0-9a-f]{12}\.svg$/,
    );
    expect(state.bookmarkRequests).toHaveLength(1);
    expect(state.bookmarkRequests[0]).toMatchObject({
      method: "POST",
      csrf: "csrf-token",
    });
    expect(state.bookmarkRequests[0].cookie).toContain(
      "accessToken=test-access",
    );
    await expect(bookmark).toBeEnabled();

    await page.reload();
    const reloaded = card(page).getByRole("button", { name: "북마크" });
    await expect(reloaded).toHaveAttribute("aria-pressed", "true");
    await expect(reloaded.locator("img")).toHaveAttribute(
      "src",
      /receipt-fill-vector\.[0-9a-f]{12}\.svg$/,
    );
    await reloaded.click();
    await expect(reloaded).toHaveAttribute("aria-pressed", "false");
    await expect(reloaded.locator("img")).toHaveAttribute(
      "src",
      /receipt-stroke-vector\.[0-9a-f]{12}\.svg$/,
    );
    await expect(reloaded).toBeEnabled();
    expect(state.bookmarkRequests.at(-1).method).toBe("DELETE");

    state.failNextBookmark = true;
    await reloaded.click();
    await expect(page.getByText("북마크 처리에 실패했습니다.")).toBeVisible();
    await expect(reloaded).toHaveAttribute("aria-pressed", "false");
    await expect(reloaded.locator("img")).toHaveAttribute(
      "src",
      /receipt-stroke-vector\.[0-9a-f]{12}\.svg$/,
    );
    await expect(reloaded).toBeEnabled();

    await reloaded.click();
    await expect(reloaded).toHaveAttribute("aria-pressed", "true");
    expect(state.bookmarkRequests).toHaveLength(4);
  });
}
