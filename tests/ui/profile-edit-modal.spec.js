import { expect, test } from "@playwright/test";

async function prepare(page, { saveFails = false, saveDelay = 0 } = {}) {
  let nicknameCount = 0;
  let imageCount = 0;
  const consoleErrors = [];
  const failedAssets = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "dlkfjs" }),
    );
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      /\.(png|svg|jpg|jpeg|webp)(\?|$)/.test(response.url())
    )
      failedAssets.push(`${response.status()} ${response.url()}`);
  });
  const cors = {
    "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-XSRF-TOKEN",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
  await page.route("http://127.0.0.1:8080/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/api/csrf")
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          "Set-Cookie": "XSRF-TOKEN=profile-edit-test; Path=/; SameSite=Lax",
        },
      });
    if (url.pathname === "/api/users/me" && request.method() === "GET")
      return route.fulfill({
        json: {
          data: {
            user_id: 7,
            email: "email@email.com",
            nickname: "dlkfjs",
            profile_image: "/images/profile-default.svg",
          },
        },
        headers: cors,
      });
    if (url.pathname === "/api/v2/posts")
      return route.fulfill({ json: { data: { content: [] } }, headers: cors });
    if (url.pathname === "/api/users/7/nickname") {
      nicknameCount += 1;
      if (saveDelay)
        await new Promise((resolve) => setTimeout(resolve, saveDelay));
      if (saveFails)
        return route.fulfill({
          status: 500,
          json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
          headers: cors,
        });
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/api/v2/media/uploads" && request.method() === "POST")
      return route.fulfill({
        json: {
          data: {
            mediaId: "profile-media",
            status: "PENDING_UPLOAD",
            upload: {
              url: "http://127.0.0.1:8080/test-profile-upload",
              fields: { key: "private/uploads/profile-media/source" },
            },
          },
        },
        headers: cors,
      });
    if (url.pathname === "/test-profile-upload" && request.method() === "POST")
      return route.fulfill({ status: 204, headers: cors });
    if (
      url.pathname === "/api/v2/media/profile-media/complete" &&
      request.method() === "POST"
    )
      return route.fulfill({
        json: {
          data: {
            mediaId: "profile-media",
            status: "READY",
            frame: "PROFILE",
            mediaRevision: 1,
            transformVersion: 1,
            variants: [
              {
                type: "PROFILE_MEDIUM",
                url: "/images/profile/changed.jpg",
                width: 160,
                height: 160,
                mimeType: "image/webp",
                fileSize: 1024,
              },
            ],
          },
        },
        headers: cors,
      });
    if (
      url.pathname === "/api/v2/users/7/profile-image" &&
      request.method() === "PATCH"
    ) {
      imageCount += 1;
      if (saveDelay)
        await new Promise((resolve) => setTimeout(resolve, saveDelay));
      if (saveFails)
        return route.fulfill({
          status: 500,
          json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
          headers: cors,
        });
      return route.fulfill({
        json: {
          data: {
            mediaId: "profile-media",
            status: "READY",
            frame: "PROFILE",
            mediaRevision: 1,
            transformVersion: 1,
            variants: [
              {
                type: "PROFILE_MEDIUM",
                url: "/images/profile/changed.jpg",
                width: 160,
                height: 160,
                mimeType: "image/webp",
                fileSize: 1024,
              },
            ],
          },
        },
        headers: cors,
      });
    }
    if (url.pathname.endsWith("/images/profile-default.svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#fff"/><circle cx="60" cy="44" r="20" fill="#a1a1a1"/><path d="M24 104c4-24 18-36 36-36s32 12 36 36" fill="#a1a1a1"/></svg>',
        headers: cors,
      });
    if (url.pathname === "/images/profile/changed.jpg")
      return route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        path: "tests/fixtures/feed-create-reference.jpg",
        headers: cors,
      });
    return route.fulfill({ status: 204, headers: cors });
  });
  return {
    nicknameCount: () => nicknameCount,
    imageCount: () => imageCount,
    consoleErrors,
    failedAssets,
  };
}

async function openModal(page) {
  await page.goto("/feed");
  await expect(page.getByTestId("feed-content")).toHaveClass(/is-visible/);
  await page.screenshot({
    path: "tests/visual/actual/profile-edit-modal-closed-page.png",
    fullPage: true,
  });
  await page
    .locator(".lnb")
    .getByRole("button", { name: "프로필 편집", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "프로필 편집" })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

test("프로필 편집 Modal은 Figma 구조와 수치로 렌더링된다", async ({ page }) => {
  const network = await prepare(page);
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
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
    const style = (selector) => {
      const value = getComputedStyle(document.querySelector(selector));
      return {
        borderRadius: value.borderRadius,
        borderWidth: value.borderWidth,
        padding: value.padding,
        fontSize: value.fontSize,
        fontWeight: value.fontWeight,
        lineHeight: value.lineHeight,
        backgroundColor: value.backgroundColor,
      };
    };
    return {
      dialog: rect(".profile-edit-modal"),
      header: rect(".profile-edit-header"),
      editor: rect(".profile-editor"),
      avatar: rect(".profile-editor__avatar"),
      email: rect('.profile-editor input[aria-label="이메일"]'),
      nickname: rect('.profile-editor input[aria-label="닉네임"]'),
      save: rect(".profile-editor__fields button"),
      dialogStyle: style(".profile-edit-modal"),
      nicknameStyle: style('.profile-editor input[aria-label="닉네임"]'),
    };
  });
  expect(metrics.dialog).toEqual({ x: 720, y: 288, width: 480, height: 504 });
  expect(metrics.header.height).toBe(64);
  expect(metrics.editor.height).toBe(440);
  expect(metrics.avatar).toMatchObject({ width: 160, height: 160 });
  expect(metrics.email).toMatchObject({ width: 448, height: 44 });
  expect(metrics.nickname).toMatchObject({ width: 448, height: 44 });
  expect(metrics.save).toMatchObject({ width: 448, height: 48 });
  expect(metrics.dialogStyle).toMatchObject({
    borderRadius: "30px",
    borderWidth: "0px",
  });
  expect(metrics.nicknameStyle).toMatchObject({
    borderRadius: "8px",
    borderWidth: "1px",
    padding: "12px",
    fontSize: "14px",
    fontWeight: "500",
    lineHeight: "20px",
  });
  await page.screenshot({
    path: "tests/visual/actual/profile-edit-modal-full-page.png",
    fullPage: true,
  });
  await page.addStyleTag({
    content:
      ".lnb, .content-layer > :not(.modal) { visibility: hidden !important; }",
  });
  await page.screenshot({
    path: "tests/visual/actual/profile-edit-modal.png",
    fullPage: true,
  });
  await dialog.screenshot({
    path: "tests/visual/actual/profile-edit-modal-crop.png",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("닉네임과 이미지 변경 상태 및 성공 반영", async ({ page }) => {
  const network = await prepare(page);
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
  const save = dialog.getByRole("button", { name: "저장하기" });
  await expect(save).toBeDisabled();
  await dialog.getByLabel("닉네임").fill("새닉네임");
  await dialog
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/feed-create-reference.jpg");
  await expect(
    dialog.getByRole("button", { name: "이미지 업로드 취소" }),
  ).toBeVisible();
  await expect(save).toBeEnabled();
  await page.screenshot({
    path: "tests/visual/actual/profile-edit-modal-preview.png",
    fullPage: true,
  });
  await save.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".lnb-user__identity")).toContainText("새닉네임");
  expect(network.nicknameCount()).toBe(1);
  expect(network.imageCount()).toBe(1);
});

test("Pending 중 중복 요청을 막고 실패 시 입력과 Preview를 유지한다", async ({
  page,
}) => {
  const network = await prepare(page, { saveFails: true, saveDelay: 100 });
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
  await dialog.getByLabel("닉네임").fill("실패닉");
  await dialog
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/feed-create-reference.jpg");
  await expect(
    dialog.getByRole("button", { name: "이미지 업로드 취소" }),
  ).toBeVisible();
  const save = dialog.getByRole("button", { name: "저장하기" });
  await save.evaluate((button) => {
    button.click();
    button.click();
    button.click();
  });
  await page.screenshot({
    path: "tests/visual/actual/profile-edit-modal-pending.png",
    fullPage: true,
  });
  await expect(dialog).toContainText("서버 오류가 발생했습니다.");
  await expect(dialog.getByLabel("닉네임")).toHaveValue("실패닉");
  await page.screenshot({
    path: "tests/visual/actual/profile-edit-modal-failure.png",
    fullPage: true,
  });
  expect(network.imageCount()).toBe(1);
  expect(network.nicknameCount()).toBe(0);
});

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 480, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`프로필 편집 Modal ${viewport.width}×${viewport.height} 반응형`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await openModal(page);
    const box = await page
      .getByRole("dialog", { name: "프로필 편집" })
      .boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
