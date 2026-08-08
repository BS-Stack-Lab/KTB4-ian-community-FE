import { expect, test } from "@playwright/test";

const user = {
  user_id: 7,
  email: "pulse@example.com",
  nickname: "dlkfjls",
  profile_image: null,
};
const post = {
  post_id: 1,
  content: "LNB 검증 피드",
  nickname: user.nickname,
  profile_image: null,
  like_count: 3,
  comment_count: 0,
  comment: [],
};

async function prepare(page) {
  const state = { nickname: user.nickname };
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
      JSON.stringify({ userId: 7, nickname: "dlkfjls" }),
    );
  });
  await page.route("http://127.0.0.1:8080/**", async (requestRoute) => {
    const url = new URL(requestRoute.request().url());
    const method = requestRoute.request().method();
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type, X-XSRF-TOKEN",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    };
    if (method === "OPTIONS")
      return requestRoute.fulfill({ status: 204, headers });
    if (url.pathname === "/api/csrf")
      return requestRoute.fulfill({
        status: 200,
        headers: { ...headers, "Set-Cookie": "XSRF-TOKEN=test; Path=/" },
      });
    if (url.pathname === "/images/profile-default.svg")
      return requestRoute.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16.25" fill="white" stroke="#e5e5e5" stroke-width="1.5"/><circle cx="17" cy="12" r="4" fill="#a1a1a1"/><path d="M9 26v-3c0-4 3-7 8-7s8 3 8 7v3" fill="#a1a1a1"/></svg>',
        headers,
      });
    if (url.pathname === "/api/users/me" && method === "GET")
      return requestRoute.fulfill({
        json: { data: { ...user, nickname: state.nickname } },
        headers,
      });
    if (url.pathname === "/api/users/7/nickname" && method === "PATCH") {
      state.nickname = JSON.parse(requestRoute.request().postData()).nickname;
      return requestRoute.fulfill({ status: 204, headers });
    }
    if (url.pathname === "/api/v2/posts" && method === "GET")
      return requestRoute.fulfill({
        json: { data: { content: [post] } },
        headers,
      });
    if (url.pathname === "/api/v2/posts/1" && method === "GET")
      return requestRoute.fulfill({ json: { data: post }, headers });
    return requestRoute.fulfill({ status: 204, headers });
  });
  return { consoleErrors, failedAssets };
}

async function waitForStableLnb(page) {
  await page.locator(".lnb").waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((element) => {
        if (element.complete) return undefined;
        return new Promise((resolve) => {
          element.addEventListener("load", resolve, { once: true });
          element.addEventListener("error", resolve, { once: true });
        });
      }),
    );
  });
}

test("LNB는 Figma 위치·크기·간격과 원본 SVG를 사용한다", async ({ page }) => {
  const network = await prepare(page);
  await page.goto("/feed");
  await expect(page.getByText("LNB 검증 피드")).toBeVisible();
  await waitForStableLnb(page);

  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
      };
    };
    const rows = [...document.querySelectorAll(".lnb-navigation__item")];
    return {
      lnb: rect(".lnb"),
      logo: rect(".lnb__logo"),
      main: rect(".page"),
      row: rect(".lnb-navigation__item"),
      rowGap: getComputedStyle(document.querySelector(".lnb-navigation")).gap,
      icon: rect(".lnb-icon"),
      selectedBackground: getComputedStyle(rows[0]).backgroundColor,
      accountLabelColor: getComputedStyle(
        document.querySelector(".lnb-account__label"),
      ).color,
      logoutColor: getComputedStyle(document.querySelector(".lnb-user__logout"))
        .color,
      iconSources: rows.flatMap((row) =>
        [...row.querySelectorAll(".lnb-icon img")].map((image) => image.src),
      ),
    };
  });
  expect(metrics.lnb).toEqual({ x: 500, y: 0, width: 180, height: 1080 });
  expect(metrics.logo).toMatchObject({ x: 500, y: 40, height: 31 });
  expect(metrics.logo.width).toBeCloseTo(107.732, 1);
  expect(metrics.main).toMatchObject({ x: 720, width: 480 });
  expect(metrics.row).toMatchObject({ width: 180, height: 28 });
  expect(metrics.rowGap).toBe("8px");
  expect(metrics.icon).toMatchObject({ width: 20, height: 20 });
  expect(metrics.selectedBackground).toBe("rgb(245, 245, 245)");
  expect(metrics.accountLabelColor).toBe("rgb(161, 161, 161)");
  expect(metrics.logoutColor).toBe("rgb(161, 161, 161)");
  expect(metrics.iconSources.length).toBeGreaterThanOrEqual(7);
  expect(
    metrics.iconSources.every((source) => source.includes("assets/")),
  ).toBe(true);
  await page.screenshot({
    path: "tests/visual/after/feed-lnb-full-page.png",
    animations: "disabled",
  });
  await page.locator(".lnb").screenshot({
    path: "tests/visual/after/lnb-feed.png",
    animations: "disabled",
  });

  const bookmark = page
    .locator(".lnb")
    .getByRole("button", { name: "북마크", exact: true });
  await bookmark.hover();
  await page.locator(".lnb").screenshot({
    path: "tests/visual/after/lnb-hover.png",
    animations: "disabled",
  });
  await bookmark.focus();
  await expect(bookmark).toBeFocused();
  await page.locator(".lnb").screenshot({
    path: "tests/visual/after/lnb-focus-visible.png",
    animations: "disabled",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("LNB Route와 Modal 활성 상태는 뒤로가기·키보드까지 동기화된다", async ({
  page,
}) => {
  const network = await prepare(page);
  await page.goto("/feed");
  await waitForStableLnb(page);
  const lnb = page.locator(".lnb");
  const feed = lnb.getByRole("button", { name: "피드", exact: true });
  const create = lnb.getByRole("button", {
    name: "새로운 피드 작성",
    exact: true,
  });
  const bookmark = lnb.getByRole("button", {
    name: "북마크",
    exact: true,
  });
  await expect(feed).toHaveAttribute("aria-current", "page");

  await bookmark.click();
  await expect(page).toHaveURL(/\/bookmarks$/);
  await expect(bookmark).toHaveAttribute("aria-current", "page");
  await page.locator(".lnb").screenshot({
    path: "tests/visual/after/lnb-bookmarks.png",
    animations: "disabled",
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(feed).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(bookmark).toHaveAttribute("aria-current", "page");

  await feed.click();
  await create.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog", { name: "피드 생성" })).toBeVisible();
  await expect(create).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "tests/visual/after/lnb-create-active.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "피드 생성" })).toHaveCount(0);
  await expect(create).toBeFocused();
  await expect(create).toHaveAttribute("aria-pressed", "false");

  await feed.click();
  await expect(page).toHaveURL(/\/feed$/);
  await page.getByText("LNB 검증 피드").click();
  await expect(page).toHaveURL(/\/posts\/1$/);
  await expect(feed).toHaveAttribute("aria-current", "page");
  await page.locator(".lnb").screenshot({
    path: "tests/visual/after/lnb-post-detail.png",
    animations: "disabled",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("LNB 사용자 정보·프로필 반영·Fallback·Session Trigger가 동작한다", async ({
  page,
}) => {
  const network = await prepare(page);
  await page.goto("/feed");
  await waitForStableLnb(page);
  const profile = page.getByRole("button", {
    name: "프로필 편집",
    exact: true,
  });
  await profile.click();
  await expect(profile).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "tests/visual/after/lnb-profile-active.png",
    animations: "disabled",
  });
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
  await dialog.getByLabel("닉네임").fill("변경닉네임");
  await dialog.getByRole("button", { name: "저장하기" }).click();
  await expect(page.locator(".lnb-user__identity strong")).toHaveText(
    "변경닉네임",
  );

  const avatar = page.locator(".lnb-user .user-avatar");
  await avatar.evaluate((element) => element.dispatchEvent(new Event("error")));
  await expect(avatar).toHaveAttribute(
    "src",
    "http://127.0.0.1:8080/images/profile-default.svg",
  );

  const password = page.getByRole("button", {
    name: "비밀번호 변경",
    exact: true,
  });
  await password.click();
  await expect(password).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "tests/visual/after/lnb-password-active.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "로그아웃 확인" }),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/visual/after/lnb-user-and-logout.png",
    animations: "disabled",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});
