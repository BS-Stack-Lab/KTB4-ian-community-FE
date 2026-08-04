import { expect, test } from "@playwright/test";

const cors = {
  "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
  "Access-Control-Allow-Credentials": "true",
};

async function seedSession(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "상태 사용자" }),
    );
  });
}

async function routeUser(page) {
  await page.route("http://127.0.0.1:8080/api/users/me", (route) =>
    route.fulfill({
      json: {
        data: {
          user_id: 7,
          email: "state@example.com",
          nickname: "상태 사용자",
          profile_image: "/images/profile-default.svg",
        },
      },
      headers: cors,
    }),
  );
  await page.route("http://127.0.0.1:8080/images/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"/>',
      headers: cors,
    }),
  );
}

test("인증 초기화 Loading은 응답 전 표시되고 완료 후 보호 Page로 전환된다", async ({
  page,
}) => {
  await seedSession(page);
  let releaseUser;
  await page.route("http://127.0.0.1:8080/api/users/me", async (route) => {
    await new Promise((resolve) => {
      releaseUser = resolve;
    });
    await route.fulfill({
      json: {
        data: { user_id: 7, nickname: "상태 사용자" },
      },
      headers: cors,
    });
  });
  await page.goto("/bookmarks");
  const loading = page.getByRole("main").filter({
    hasText: "PULSE를 준비하고 있습니다.",
  });
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await page.screenshot({
    path: "tests/visual/after/auth-loading.png",
    fullPage: true,
  });
  releaseUser();
  await expect(page.getByTestId("bookmarks-page-ready")).toBeVisible();
});

test("Not Found는 Community Layout과 SPA 피드 복귀를 제공한다", async ({
  page,
}) => {
  await seedSession(page);
  await routeUser(page);
  await page.route("http://127.0.0.1:8080/api/posts?*", (route) =>
    route.fulfill({ json: { data: { content: [] } }, headers: cors }),
  );
  await page.goto("/없는-주소");
  await expect(
    page.getByRole("heading", { name: "페이지를 찾을 수 없습니다." }),
  ).toBeVisible();
  const rect = await page.locator(".status-page").evaluate((element) => {
    const value = element.getBoundingClientRect();
    return { x: value.x, y: value.y, width: value.width };
  });
  expect(rect).toEqual({ x: 720, y: 40, width: 480 });
  await page.screenshot({
    path: "tests/visual/after/not-found.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "피드로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/feed$/);
});

test("Feed 오류는 Retry 후 Content로 회복한다", async ({ page }) => {
  await seedSession(page);
  await routeUser(page);
  let requestCount = 0;
  await page.route("http://127.0.0.1:8080/api/posts?*", (route) => {
    requestCount += 1;
    if (requestCount === 1)
      return route.fulfill({
        status: 500,
        json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
        headers: cors,
      });
    return route.fulfill({ json: { data: { content: [] } }, headers: cors });
  });
  await page.goto("/feed");
  await expect(page.getByText("서버 오류가 발생했습니다.")).toBeVisible();
  await page.screenshot({
    path: "tests/visual/after/feed-error.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("아직 생성된 피드가 없어요.")).toBeVisible();
  expect(requestCount).toBe(2);
});

test("빈 Feed와 Bookmark의 Stroke는 Viewport 하단까지 유지된다", async ({
  page,
}) => {
  await seedSession(page);
  await routeUser(page);
  await page.route("http://127.0.0.1:8080/api/posts?*", (route) =>
    route.fulfill({ json: { data: { content: [] } }, headers: cors }),
  );
  await page.route("http://127.0.0.1:8080/api/posts/bookmarks?*", (route) =>
    route.fulfill({ json: { data: { content: [] } }, headers: cors }),
  );

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);

    for (const target of [
      {
        path: "/feed",
        selector: ".feed-page",
        emptyText: "아직 생성된 피드가 없어요.",
        topOffset: 40,
      },
      {
        path: "/bookmarks",
        selector: ".bookmarks-page",
        emptyText: "저장한 북마크가 없어요.",
        topOffset: 40,
      },
    ]) {
      await page.goto(target.path);
      await expect(page.getByText(target.emptyText)).toBeVisible();

      const metrics = await page
        .locator(target.selector)
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const stroke = getComputedStyle(element, "::after");
          return {
            height: rect.height,
            stroke: stroke.borderLeft,
            scrollWidth: document.documentElement.scrollWidth,
          };
        });

      expect(metrics.height).toBeGreaterThanOrEqual(
        viewport.height - target.topOffset,
      );
      expect(metrics.stroke).toBe("1px solid rgb(229, 229, 229)");
      expect(metrics.scrollWidth).toBe(viewport.width);
    }
  }
});

test("Post Detail 오류는 Header를 유지하고 Retry 후 본문을 표시한다", async ({
  page,
}) => {
  await seedSession(page);
  await routeUser(page);
  let requestCount = 0;
  await page.route("http://127.0.0.1:8080/api/posts/31", (route) => {
    requestCount += 1;
    if (requestCount === 1)
      return route.fulfill({
        status: 500,
        json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
        headers: cors,
      });
    return route.fulfill({
      json: {
        data: {
          post_id: 31,
          content: "재시도로 불러온 피드",
          nickname: "상태 사용자",
          comment: [],
        },
      },
      headers: cors,
    });
  });
  await page.goto("/posts/31");
  await expect(
    page.getByRole("heading", { name: "피드 상세보기" }),
  ).toBeVisible();
  await expect(page.getByText("서버 오류가 발생했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("재시도로 불러온 피드")).toBeVisible();
  expect(requestCount).toBe(2);
});
