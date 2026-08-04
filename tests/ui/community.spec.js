import { expect, test } from "@playwright/test";

const user = {
  user_id: 7,
  email: "pulse@example.com",
  nickname: "PULSE 사용자",
  profile_image: "/images/me.png",
};
const feed = {
  post_id: 1,
  content: "Figma 기준 커뮤니티 피드",
  nickname: "PULSE 사용자",
  profile_image: "/images/me.png",
  like_count: 3,
  comment_count: 0,
  comment: [],
};

async function prepare(
  page,
  { createFails = false, feedDelay = 0, detailUserId = null } = {},
) {
  let bookmarked = false;
  const cors = {
    "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-XSRF-TOKEN",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
  await page.addInitScript(() => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "PULSE 사용자" }),
    );
  });
  await page.route("http://127.0.0.1:8080/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(".png") || url.pathname.endsWith(".svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"/>',
        headers: cors,
      });
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/api/csrf")
      return route.fulfill({
        status: 200,
        headers: { ...cors, "Set-Cookie": "XSRF-TOKEN=test; Path=/" },
      });
    if (url.pathname === "/api/users/me")
      return route.fulfill({ json: { data: user }, headers: cors });
    if (
      url.pathname === "/api/posts/1/bookmarks" &&
      route.request().method() === "POST"
    ) {
      bookmarked = true;
      return route.fulfill({
        json: { data: { postId: 1, bookmarked: true } },
        headers: cors,
      });
    }
    if (
      url.pathname === "/api/posts/1/bookmarks" &&
      route.request().method() === "DELETE"
    ) {
      bookmarked = false;
      return route.fulfill({ status: 204, headers: cors });
    }
    if (
      url.pathname === "/api/posts/bookmarks" &&
      route.request().method() === "GET"
    )
      return route.fulfill({
        json: {
          data: {
            content: bookmarked ? [{ ...feed, bookmarked: true }] : [],
            hasNext: false,
          },
        },
        headers: cors,
      });
    if (url.pathname === "/api/posts" && route.request().method() === "GET")
      if (feedDelay)
        await new Promise((resolve) => setTimeout(resolve, feedDelay));
    if (url.pathname === "/api/posts" && route.request().method() === "GET")
      return route.fulfill({
        json: {
          data: {
            content: [{ ...feed, bookmarked }],
            hasNext: false,
          },
        },
        headers: cors,
      });
    if (url.pathname === "/api/posts/1" && route.request().method() === "GET")
      return route.fulfill({
        json: {
          data:
            detailUserId == null
              ? feed
              : {
                  ...feed,
                  user_id: detailUserId,
                },
        },
        headers: cors,
      });
    if (url.pathname === "/api/posts/me" && createFails)
      return route.fulfill({
        status: 500,
        json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
        headers: cors,
      });
    return route.fulfill({ status: 204, headers: cors });
  });
}

test("/feed 직접 접근과 현재 사용자 34px 프로필", async ({ page }) => {
  await prepare(page);
  await page.goto("/feed");
  await expect(page.getByText("Figma 기준 커뮤니티 피드")).toBeVisible({
    timeout: 10_000,
  });
  const avatar = page.locator(".create-trigger .user-avatar");
  await expect(avatar).toHaveCSS("width", "34px");
  await expect(avatar).toHaveAttribute(
    "src",
    "http://127.0.0.1:8080/images/me.png",
  );
});
test("피드 생성은 trim 본문이 있어야 활성화", async ({ page }) => {
  await prepare(page);
  await page.goto("/feed");
  await page.getByRole("button", { name: "피드 게시하기" }).click();
  const submit = page.getByRole("button", { name: "피드 게시", exact: true });
  await page.getByLabel("피드 본문").fill(" \n\t ");
  await expect(submit).toBeDisabled();
  await page.getByLabel("피드 본문").fill("한 글자");
  await expect(submit).toBeEnabled();
});
test("이미지만 선택하면 비활성이고 Preview는 448x288", async ({ page }) => {
  await prepare(page);
  await page.goto("/feed");
  await page.getByRole("button", { name: "피드 게시하기" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
  await expect(
    page.getByRole("button", { name: "피드 게시", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".feed-editor__preview")).toHaveCSS(
    "height",
    "288px",
  );
});
test("이미지 없는 생성 Modal은 Preview DOM이 없다", async ({ page }) => {
  await prepare(page);
  await page.goto("/feed");
  await page.getByRole("button", { name: "피드 게시하기" }).click();
  await expect(page.locator(".feed-editor__preview")).toHaveCount(0);
});
test("생성 실패 시 본문과 Preview를 유지", async ({ page }) => {
  await prepare(page, { createFails: true });
  await page.goto("/feed");
  await page.getByRole("button", { name: "피드 게시하기" }).click();
  await page.getByLabel("피드 본문").fill("재시도 본문");
  await page.locator('input[type="file"]').setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
  await page.getByRole("button", { name: "피드 게시", exact: true }).click();
  await expect(page.getByText("서버 오류가 발생했습니다.")).toBeVisible();
  await expect(page.getByLabel("피드 본문")).toHaveValue("재시도 본문");
  await expect(page.locator(".feed-editor__preview")).toBeVisible();
});
test("댓글 버튼은 trim과 pending 상태를 반영하고 색상이 다르다", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/posts/1");
  const input = page.getByLabel("댓글 작성");
  const button = page.getByRole("button", { name: "댓글 등록" });
  const disabledColor = await button.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await input.fill("댓글");
  await expect(button).toBeEnabled();
  const enabledColor = await button.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(enabledColor).not.toBe(disabledColor);
  await input.fill("   ");
  await expect(button).toBeDisabled();
});
test("피드·상세·북마크 카드는 같은 배경이고 호버해도 바뀌지 않는다", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/feed");
  const surfaceBackground = await page
    .locator("body")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const feedBody = page.locator(".post-card__body");
  await expect(feedBody).toHaveCSS("background-color", surfaceBackground);
  const feedBookmark = page
    .locator(".post-actions")
    .getByRole("button", { name: "북마크" });
  await feedBookmark.click();
  await page.getByText("북마크", { exact: true }).click();

  const bookmarkBody = page.locator(".post-card__body");
  const bookmarkBackground = await bookmarkBody.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(bookmarkBackground).toBe(surfaceBackground);
  await bookmarkBody.hover();
  expect(
    await bookmarkBody.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe(bookmarkBackground);

  await page.goto("/posts/1");
  const detailBody = page.locator(".post-card__body");
  const detailBackground = await detailBody.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(detailBackground).toBe(surfaceBackground);
  await detailBody.hover();
  expect(
    await detailBody.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe(detailBackground);
});
test("피드 상세는 내 글에 하단 더보기 메뉴를 표시한다", async ({ page }) => {
  await prepare(page, { detailUserId: 7 });
  await page.goto("/posts/1");

  const card = page.locator(".post-card");
  const options = card
    .locator(".post-actions")
    .getByRole("button", { name: "피드 옵션" });
  await expect(card.getByRole("button", { name: "북마크" })).toHaveCount(0);
  await expect(
    card
      .locator(".post-card__header")
      .getByRole("button", { name: "피드 옵션" }),
  ).toHaveCount(0);
  await expect(options).toBeVisible();
  await expect(options).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await options.hover();
  await expect(options).toHaveCSS("background-color", "rgb(245, 245, 245)");

  await options.click();
  await expect(card.getByRole("menuitem")).toHaveText([
    "저장하기",
    "수정하기",
    "삭제하기",
  ]);
  await options.click();
  await expect(card.getByRole("menu")).toHaveCount(0);
  await expect(options).toHaveAttribute("aria-expanded", "false");
  await options.click();
  await expect(card.getByRole("menu")).toBeVisible();
  await page.screenshot({
    path: "tests/visual/after/post-detail-owner-options.png",
    animations: "disabled",
  });
});
test("피드 상세 더보기 메뉴는 아래 공간이 부족하면 위로 열린다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 320 });
  await prepare(page, { detailUserId: 7 });
  await page.goto("/posts/1");

  const options = page
    .locator(".post-actions")
    .getByRole("button", { name: "피드 옵션" });
  await options.click();
  const menu = page.getByRole("menu");
  const [optionsBox, menuBox] = await Promise.all([
    options.boundingBox(),
    menu.boundingBox(),
  ]);

  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(optionsBox.y);
  expect(menuBox.y).toBeGreaterThanOrEqual(8);
});
test("피드 상세는 타인 글에 기존 북마크 버튼을 표시한다", async ({ page }) => {
  await prepare(page, { detailUserId: 8 });
  await page.goto("/posts/1");

  const card = page.locator(".post-card");
  await expect(card.getByRole("button", { name: "북마크" })).toBeVisible();
  await expect(card.getByRole("button", { name: "피드 옵션" })).toHaveCount(0);
});
test("북마크는 Feed에서 저장하고 목록에서 삭제할 수 있다", async ({ page }) => {
  await prepare(page);
  await page.goto("/feed");
  const feedBookmark = page
    .locator(".post-actions")
    .getByRole("button", { name: "북마크" });
  await expect(feedBookmark).toBeEnabled();
  await expect(feedBookmark).toHaveAttribute("aria-pressed", "false");
  await feedBookmark.click();
  await expect(feedBookmark).toHaveAttribute("aria-pressed", "true");
  await page.getByText("북마크", { exact: true }).click();
  await expect(page.getByText("Figma 기준 커뮤니티 피드")).toBeVisible();
  await expect(page).toHaveURL(/\/bookmarks$/);
  const layout = await page.evaluate(() => {
    const pageRect = document
      .querySelector(".bookmarks-page")
      .getBoundingClientRect();
    const headerRect = document
      .querySelector(".bookmarks-page__header")
      .getBoundingClientRect();
    const stroke = getComputedStyle(
      document.querySelector(".bookmarks-page"),
      "::after",
    );
    return {
      page: {
        x: pageRect.x,
        y: pageRect.y,
        width: pageRect.width,
        height: pageRect.height,
      },
      headerHeight: headerRect.height,
      stroke: {
        borderLeft: stroke.borderLeft,
        width: stroke.borderLeftWidth,
        style: stroke.borderLeftStyle,
        color: stroke.borderLeftColor,
        radius: stroke.borderRadius,
        pointerEvents: stroke.pointerEvents,
        position: stroke.position,
        zIndex: stroke.zIndex,
      },
      radius: getComputedStyle(document.querySelector(".bookmarks-page"))
        .borderRadius,
    };
  });
  expect(layout.page).toMatchObject({ x: 720, y: 40, width: 480 });
  expect(layout.page.height).toBeGreaterThanOrEqual(1040);
  expect(layout.headerHeight).toBe(64);
  expect(layout.radius).toBe("30px");
  expect(layout.stroke).toEqual({
    borderLeft: "1px solid rgb(229, 229, 229)",
    width: "1px",
    style: "solid",
    color: "rgb(229, 229, 229)",
    radius: "30px",
    pointerEvents: "none",
    position: "absolute",
    zIndex: "30",
  });
  await page.screenshot({
    path: "tests/visual/after/bookmarks.png",
    fullPage: true,
  });
  await page
    .locator(".post-actions")
    .getByRole("button", { name: "북마크" })
    .click();
  await expect(page.getByText("저장한 북마크가 없어요.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test("로그아웃과 회원탈퇴 확인만 Primary, 취소는 Outline", async ({ page }) => {
  await prepare(page);
  await page.goto("/feed");
  await page.getByRole("button", { name: "로그아웃" }).click();
  const confirm = page.getByRole("button", { name: "확인" });
  const cancel = page.getByRole("button", { name: "취소" });
  expect(
    await confirm.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe(
    await cancel.evaluate((el) => getComputedStyle(el).backgroundColor),
  );
  await expect(confirm).toHaveClass(/button--primary/);
  await expect(cancel).toHaveClass(/button--outline/);
});
test("동적 postId 직접 접근", async ({ page }) => {
  await prepare(page);
  await page.goto("/posts/1");
  await expect(page.getByText("Figma 기준 커뮤니티 피드")).toBeVisible();
});
test("느린 피드는 Content 표시 후 Skeleton을 제거한다", async ({ page }) => {
  await prepare(page, { feedDelay: 350 });
  await page.goto("/feed");
  const skeleton = page.getByTestId("feed-skeleton");
  const content = page.getByTestId("feed-content");
  await expect(skeleton).toBeVisible();
  await expect(content).toHaveCSS("opacity", "0");
  await expect(page.getByText("Figma 기준 커뮤니티 피드")).toBeVisible();
  await expect(skeleton).toBeAttached();
  await expect(skeleton).not.toBeAttached();
});
test("빠른 피드는 Skeleton flash 없이 Content를 표시한다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepare(page);
  await page.goto("/feed");
  await expect(page.getByText("Figma 기준 커뮤니티 피드")).toBeVisible();
  await expect(page.getByTestId("feed-skeleton")).toHaveCount(0);
});
