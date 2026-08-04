import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const postImagePath = fileURLToPath(
  new URL("../fixtures/feed-figma-image-1.jpeg", import.meta.url),
);

async function prepare(page) {
  const consoleErrors = [];
  const failedAssets = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      /\.(?:svg|png|jpe?g|webp)(?:\?|$)/i.test(response.url())
    )
      failedAssets.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "현재 사용자" }),
    );
  });
  await page.route("http://127.0.0.1:8080/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type, X-XSRF-TOKEN",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname === "/api/csrf")
      return route.fulfill({
        status: 200,
        headers: { ...headers, "Set-Cookie": "XSRF-TOKEN=test; Path=/" },
      });
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          data: {
            user_id: 7,
            nickname: "현재 사용자",
            profile_image: "/images/profile-default.svg",
          },
        },
        headers,
      });
    if (url.pathname === "/api/posts/31")
      return route.fulfill({
        json: {
          data: {
            post_id: 31,
            content:
              "분위기 좋은 다로베에서 화덕피자 먹고, 도보 5분 거리 재즈바 '포지티브 제로'로 이동하세요. 조명이 예뻐서 서로 더 예뻐 보이는 마법의 코스입니다. (예약 필수!)",
            nickname: "dlkfjls",
            profile_image: "/images/profile-default.svg",
            image_url: "/images/post-detail.jpeg",
            view_count: 12_345,
            like_count: 12_345,
            comment_count: 1,
            created_at: new Date().toISOString(),
            comment: [
              {
                comment_id: 41,
                user_id: 7,
                nickname: "현재 사용자",
                profile_image: "/images/profile-default.svg",
                comment: "댓글 본문",
              },
            ],
          },
        },
        headers,
      });
    if (url.pathname === "/images/post-detail.jpeg")
      return route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        path: postImagePath,
        headers,
      });
    if (url.pathname.endsWith(".svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16.25" fill="white" stroke="#e5e5e5" stroke-width="1.5"/><circle cx="17" cy="12" r="4" fill="#a1a1a1"/><path d="M9 26v-3c0-4 3-7 8-7s8 3 8 7v3" fill="#a1a1a1"/></svg>',
        headers,
      });
    return route.fulfill({ status: 204, headers });
  });
  return { consoleErrors, failedAssets };
}

async function waitForStableDetail(page) {
  await expect(
    page.getByRole("heading", { name: "피드 상세보기" }),
  ).toBeVisible();
  await expect(page.locator(".post-card__image")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => {
        if (image.complete) return undefined;
        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }),
    );
  });
}

test("Post Detail Header와 본문은 Figma 위치·크기를 사용한다", async ({
  page,
}) => {
  const network = await prepare(page);
  await page.goto("/posts/31");
  await waitForStableDetail(page);
  const metrics = await page.evaluate(() => {
    const measure = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    };
    const title = document.querySelector(".page-header h1");
    const pageElement = document.querySelector(".post-detail-page");
    const pageStroke = getComputedStyle(pageElement, "::after");
    return {
      page: measure(".post-detail-page"),
      header: measure(".page-header"),
      back: measure(".page-header button"),
      title: measure(".page-header h1"),
      image: measure(".post-detail-page .post-card__image"),
      composer: measure(".comment-composer"),
      commentForm: measure(".comment-form"),
      commentSubmit: measure(".comment-form .submit-icon"),
      commentSubmitIcon: measure(".comment-form .submit-icon > img"),
      commentFormStyle: {
        backgroundColor: getComputedStyle(
          document.querySelector(".comment-form"),
        ).backgroundColor,
        borderRadius: getComputedStyle(document.querySelector(".comment-form"))
          .borderRadius,
        padding: getComputedStyle(document.querySelector(".comment-form"))
          .padding,
      },
      commentPlaceholder: getComputedStyle(
        document.querySelector(".comment-form textarea"),
        "::placeholder",
      ).color,
      commentSubmitBackground: getComputedStyle(
        document.querySelector(".comment-form .submit-icon"),
      ).backgroundColor,
      pageRadius: getComputedStyle(pageElement).borderRadius,
      pageStroke: {
        borderLeft: pageStroke.borderLeft,
        width: pageStroke.borderLeftWidth,
        style: pageStroke.borderLeftStyle,
        color: pageStroke.borderLeftColor,
        radius: pageStroke.borderRadius,
        pointerEvents: pageStroke.pointerEvents,
        position: pageStroke.position,
        zIndex: pageStroke.zIndex,
      },
      titleTypography: {
        fontSize: getComputedStyle(title).fontSize,
        fontWeight: getComputedStyle(title).fontWeight,
        lineHeight: getComputedStyle(title).lineHeight,
      },
    };
  });
  expect(metrics.page).toMatchObject({ x: 720, y: 37, width: 480 });
  expect(metrics.header).toMatchObject({ width: 480, height: 60 });
  expect(metrics.back).toMatchObject({ x: 736, width: 24, height: 24 });
  expect(metrics.image).toMatchObject({ x: 736, width: 448, height: 288 });
  expect(metrics.composer).toMatchObject({ width: 480, height: 84 });
  expect(metrics.commentForm).toMatchObject({
    x: 736,
    width: 448,
    height: 44,
  });
  expect(metrics.commentSubmit).toMatchObject({ width: 32, height: 32 });
  expect(metrics.commentSubmitIcon).toMatchObject({ width: 16, height: 16 });
  expect(metrics.commentFormStyle).toEqual({
    backgroundColor: "rgb(245, 245, 245)",
    borderRadius: "99999px",
    padding: "6px 6px 6px 16px",
  });
  expect(metrics.commentPlaceholder).toBe("rgb(115, 115, 115)");
  expect(metrics.commentSubmitBackground).toBe("rgb(161, 161, 161)");
  expect(metrics.pageStroke).toEqual({
    borderLeft: "1px solid rgb(229, 229, 229)",
    width: "1px",
    style: "solid",
    color: "rgb(229, 229, 229)",
    radius: "30px",
    pointerEvents: "none",
    position: "absolute",
    zIndex: "30",
  });
  expect(metrics.pageRadius).toBe("30px");
  expect(metrics.page.height).toBeGreaterThanOrEqual(1043);
  expect(metrics.titleTypography).toEqual({
    fontSize: "20px",
    fontWeight: "700",
    lineHeight: "28px",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
  await page.screenshot({
    path: "tests/visual/after/post-detail-core.png",
    animations: "disabled",
  });
});

test("Post Detail Stroke는 반응형 Viewport에서도 유지된다", async ({
  page,
}) => {
  await prepare(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/posts/31");
    await waitForStableDetail(page);

    const metrics = await page
      .locator(".post-detail-page")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const stroke = getComputedStyle(element, "::after");
        return {
          width: rect.width,
          height: rect.height,
          stroke: stroke.borderLeft,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

    expect(metrics.width).toBeLessThanOrEqual(480);
    expect(metrics.height).toBeGreaterThanOrEqual(viewport.height - 37);
    expect(metrics.stroke).toBe("1px solid rgb(229, 229, 229)");
    expect(metrics.scrollWidth).toBe(viewport.width);
  }
});

test("Post Detail 뒤로가기는 새로고침 없이 Feed로 이동한다", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/posts/31");
  await waitForStableDetail(page);
  await page.getByRole("button", { name: "뒤로가기" }).click();
  await expect(page).toHaveURL(/\/feed$/);
});

test("댓글 Option Menu는 Figma 크기·순서와 Focus 복원을 사용한다", async ({
  page,
}) => {
  const network = await prepare(page);
  await page.goto("/posts/31");
  await waitForStableDetail(page);
  const trigger = page.getByRole("button", { name: "댓글 옵션" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem").allTextContents()).resolves.toEqual([
    "수정하기",
    "삭제하기",
  ]);
  const box = await menu.boundingBox();
  expect(box.width).toBe(160);
  expect(box.height).toBe(76);
  await expect(menu.getByRole("menuitem", { name: "수정하기" })).toBeFocused();
  await page.screenshot({
    path: "tests/visual/after/post-detail-option-menu.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});
