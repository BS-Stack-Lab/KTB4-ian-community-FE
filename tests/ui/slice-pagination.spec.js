import { expect, test } from "@playwright/test";

const user = {
  user_id: 7,
  email: "slice@example.com",
  nickname: "Slice 사용자",
  profile_image: "/images/profile.svg",
};

function post(postId, content, createdAt) {
  return {
    post_id: postId,
    user_id: 7,
    content,
    nickname: user.nickname,
    profile_image: user.profile_image,
    like_count: 0,
    liked: false,
    comment_count: 0,
    view_count: 0,
    created_at: createdAt,
    bookmarked: true,
    comment: [],
  };
}

async function prepare(page, { empty = false } = {}) {
  const state = {
    feedRequests: 0,
    feedRequestedPages: [],
    bookmarkRequests: 0,
  };
  const headers = {
    "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-XSRF-TOKEN",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
  const first = Array.from({ length: 10 }, (_, index) =>
    post(
      11 - index,
      `피드 ${11 - index}`,
      index < 2 ? "2026-07-29T10:00:00Z" : `2026-07-29T0${9 - index}:00:00Z`,
    ),
  );
  const feedFirst = Array.from({ length: 10 }, (_, index) =>
    post(21 - index, `피드 ${21 - index}`, `2026-07-30T${20 - index}:00:00Z`),
  );
  const feedSecond = Array.from({ length: 10 }, (_, index) =>
    post(11 - index, `피드 ${11 - index}`, `2026-07-29T${20 - index}:00:00Z`),
  );
  const last = [post(1, "피드 1", "2026-07-28T23:00:00Z")];

  await page.addInitScript(() => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "Slice 사용자" }),
    );
  });

  await page.route("http://127.0.0.1:8080/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname === "/api/users/me")
      return route.fulfill({ json: { data: user }, headers });
    if (url.pathname.endsWith(".svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: "<svg xmlns='http://www.w3.org/2000/svg'/>",
        headers,
      });

    const pageNumber = Number(url.searchParams.get("page") || 0);
    const isBookmarks = url.pathname === "/api/v2/posts/bookmarks";
    if (
      request.method() === "GET" &&
      (url.pathname === "/api/v2/posts" || isBookmarks)
    ) {
      if (isBookmarks) {
        state.bookmarkRequests += 1;
      } else {
        state.feedRequests += 1;
        state.feedRequestedPages.push(pageNumber);
      }
      const content = empty
        ? []
        : isBookmarks
          ? pageNumber === 0
            ? first
            : last
          : pageNumber === 0
            ? feedFirst
            : pageNumber === 1
              ? feedSecond
              : last;
      const hasNext =
        !empty && (isBookmarks ? pageNumber === 0 : pageNumber < 2);
      return route.fulfill({
        json: {
          data: {
            content,
            page: pageNumber,
            size: 10,
            hasNext,
            message: hasNext
              ? null
              : isBookmarks
                ? "더 이상 조회할 북마크가 없습니다."
                : "더 이상 조회할 피드가 없습니다.",
          },
        },
        headers,
      });
    }
    return route.fulfill({ status: 204, headers });
  });

  return state;
}

async function finishSlice(page, lastText, moreButtonName) {
  await expect(page.getByText("피드 11", { exact: true })).toBeVisible();
  await expect(page.getByText("피드 2", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: moreButtonName })
    .scrollIntoViewIfNeeded();
  await expect(page.getByText("피드 1", { exact: true })).toBeVisible();
  if (lastText) {
    await expect(page.getByText(lastText)).toHaveCount(1);
    await expect(page.getByText(lastText)).toHaveAttribute(
      "aria-live",
      "polite",
    );
  }
}

test("Feed는 6번째·16번째 카드 진입 시 선조회하고 종료 후 재조회하지 않는다", async ({
  page,
}) => {
  const state = await prepare(page);
  await page.setViewportSize({ width: 1920, height: 320 });
  await page.goto("/feed");
  await expect(page.getByText("피드 21", { exact: true })).toBeVisible();
  await expect(page.locator(".post-card")).toHaveCount(10);
  expect(state.feedRequestedPages).toEqual([0]);

  await page.locator(".post-card").nth(5).scrollIntoViewIfNeeded();
  await expect(page.locator(".post-card")).toHaveCount(20);
  expect(state.feedRequestedPages).toEqual([0, 1]);

  await page.locator(".post-card").nth(15).scrollIntoViewIfNeeded();
  await expect(page.locator(".post-card")).toHaveCount(21);
  expect(state.feedRequestedPages).toEqual([0, 1, 2]);
  await expect(page.getByText("더 이상 조회할 피드가 없습니다.")).toHaveCount(
    0,
  );

  expect(state.feedRequests).toBe(3);
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  expect(state.feedRequests).toBe(3);
  expect(state.feedRequestedPages).toEqual([0, 1, 2]);
  await expect(page.locator(".post-card")).toHaveCount(21);
});

test("11개 Bookmark Slice를 병합하고 종료 뒤 Scroll·visibility 재조회를 막는다", async ({
  page,
}) => {
  const state = await prepare(page);
  await page.goto("/bookmarks");
  await finishSlice(
    page,
    "더 이상 조회할 북마크가 없습니다.",
    "북마크 더 보기",
  );

  expect(state.bookmarkRequests).toBe(2);
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  expect(state.bookmarkRequests).toBe(2);
  await expect(page.locator(".post-card")).toHaveCount(11);
});

test("빈 Feed와 빈 Bookmark 메시지는 Slice 종료 메시지와 구분한다", async ({
  page,
}) => {
  await prepare(page, { empty: true });
  await page.goto("/feed");
  await expect(page.getByText("아직 생성된 피드가 없어요.")).toBeVisible();
  await expect(page.getByText("더 이상 조회할 피드가 없습니다.")).toHaveCount(
    0,
  );

  await page.goto("/bookmarks");
  await expect(page.getByText("저장한 북마크가 없어요.")).toBeVisible();
  await expect(page.getByText("더 이상 조회할 북마크가 없습니다.")).toHaveCount(
    0,
  );
});
