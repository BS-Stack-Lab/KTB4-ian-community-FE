import { expect, test } from "@playwright/test";

const user = {
  user_id: 7,
  email: "pulse@example.com",
  nickname: "dlkfjs",
  profile_image: "/images/profile-default.svg",
};

const figmaContent =
  "분위기 좋은 다로베에서 화덕피자 먹고, 도보 5분 거리 재즈바 '포지티브 제로'로 이동하세요. 조명이 예뻐서 서로 더 예뻐 보이는 마법의 코스입니다. (예약 필수!)";

async function prepare(page, { createFails = false, createDelay = 0 } = {}) {
  let createCount = 0;
  let mediaCount = 0;
  const consoleErrors = [];
  const failedAssets = [];
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
  await page.addInitScript(() => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "dlkfjs" }),
    );
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
          "Set-Cookie": "XSRF-TOKEN=feed-create-test; Path=/; SameSite=Lax",
        },
      });
    if (url.pathname === "/api/users/me")
      return route.fulfill({ json: { data: user }, headers: cors });
    if (url.pathname === "/api/v2/posts" && request.method() === "GET")
      return route.fulfill({
        json: { data: { content: [] } },
        headers: cors,
      });
    if (
      url.pathname === "/api/v2/media/uploads" &&
      request.method() === "POST"
    ) {
      mediaCount += 1;
      const mediaId = `feed-create-media-${mediaCount}`;
      return route.fulfill({
        json: {
          data: {
            mediaId,
            status: "PENDING_UPLOAD",
            upload: {
              url: "http://127.0.0.1:8080/test-media-upload",
              fields: { key: `private/uploads/${mediaId}/source` },
            },
          },
        },
        headers: cors,
      });
    }
    if (url.pathname === "/test-media-upload" && request.method() === "POST")
      return route.fulfill({ status: 204, headers: cors });
    if (
      /^\/api\/v2\/media\/feed-create-media-\d+\/complete$/.test(
        url.pathname,
      ) &&
      request.method() === "POST"
    ) {
      const mediaId = url.pathname.split("/").at(-2);
      return route.fulfill({
        json: {
          data: {
            mediaId,
            status: "READY",
            frame: "POST_LANDSCAPE",
            mediaRevision: 1,
            transformVersion: 1,
            variants: [
              {
                type: "POST_LANDSCAPE_1X",
                url: "/images/feed/edit-fixture.jpg",
                width: 448,
                height: 288,
                mimeType: "image/webp",
                fileSize: 1024,
              },
            ],
          },
        },
        headers: cors,
      });
    }
    if (
      /^\/api\/v2\/media\/feed-create-media-\d+$/.test(url.pathname) &&
      request.method() === "DELETE"
    )
      return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/api/v2/posts/me" && request.method() === "POST") {
      createCount += 1;
      if (createDelay)
        await new Promise((resolve) => setTimeout(resolve, createDelay));
      if (createFails)
        return route.fulfill({
          status: 500,
          json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
          headers: cors,
        });
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname.endsWith("/images/profile-default.svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#fff"/><circle cx="60" cy="44" r="20" fill="#a1a1a1"/><path d="M24 104c4-24 18-36 36-36s32 12 36 36" fill="#a1a1a1"/></svg>',
        headers: cors,
      });
    if (url.pathname === "/images/feed/edit-fixture.jpg")
      return route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        path: "tests/fixtures/feed-create-reference.jpg",
        headers: cors,
      });
    return route.fulfill({ status: 204, headers: cors });
  });
  return {
    createCount: () => createCount,
    consoleErrors,
    failedAssets,
  };
}

async function openModal(page) {
  await page.goto("/feed");
  await expect(page.getByTestId("feed-content")).toHaveClass(/is-visible/);
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-closed-page.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "피드 게시하기" }).click();
  await expect(page.getByRole("dialog", { name: "피드 생성" })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

async function setReferenceImage(page) {
  await page
    .locator('.feed-create-modal input[type="file"]')
    .setInputFiles("tests/fixtures/feed-create-reference.jpg");
  const imageEditor = page.getByRole("dialog", { name: "이미지 편집" });
  await expect(imageEditor).toBeVisible();
  await imageEditor.getByRole("button", { name: "이미지 첨부" }).click();
  await expect(page.getByRole("dialog", { name: "피드 생성" })).toBeVisible();
  await expect(page.getByAltText("선택한 이미지 미리보기")).toBeVisible();
  await page.getByAltText("선택한 이미지 미리보기").evaluate(
    (image) =>
      image.complete ||
      new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }),
  );
}

test("피드 생성 Modal은 Figma 구조와 수치로 렌더링된다", async ({ page }) => {
  const network = await prepare(page);
  await openModal(page);
  await expect(page.locator(".feed-editor__preview")).toHaveCount(0);
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-no-image.png",
    fullPage: true,
  });
  await setReferenceImage(page);
  await page.getByLabel("피드 본문").fill(figmaContent);

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
        backgroundColor: value.backgroundColor,
        borderRadius: value.borderRadius,
        borderWidth: value.borderWidth,
        padding: value.padding,
        fontSize: value.fontSize,
        fontWeight: value.fontWeight,
        lineHeight: value.lineHeight,
        zIndex: value.zIndex,
        boxShadow: value.boxShadow,
      };
    };
    return {
      dialog: rect(".feed-create-modal"),
      header: rect(".modal-header"),
      editor: rect(".feed-editor"),
      preview: rect(".feed-editor__preview"),
      footer: rect(".editor-footer"),
      avatar: rect(".feed-create-modal .user-avatar"),
      dialogStyle: style(".feed-create-modal"),
      backdropStyle: style(".modal"),
      textareaStyle: style(".feed-editor textarea"),
      submitStyle: style(".submit-icon"),
      submit: rect(".submit-icon"),
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  expect(metrics.dialog).toMatchObject({ width: 480, height: 518 });
  expect(metrics.dialog.x).toBe(720);
  expect(metrics.dialog.y).toBe(281);
  expect(metrics.header.height).toBe(52);
  expect(metrics.preview).toMatchObject({ width: 448, height: 288 });
  expect(metrics.footer.height).toBe(56);
  expect(metrics.avatar).toMatchObject({ width: 34, height: 34 });
  expect(metrics.dialogStyle).toMatchObject({
    borderRadius: "30px",
    borderWidth: "0px",
  });
  expect(metrics.dialogStyle.boxShadow).toContain("rgb(229, 229, 229)");
  expect(metrics.backdropStyle).toMatchObject({
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    zIndex: "100",
  });
  expect(metrics.textareaStyle).toMatchObject({
    fontSize: "12px",
    fontWeight: "400",
    lineHeight: "18px",
  });
  expect(metrics.submit).toMatchObject({ width: 32, height: 32 });
  expect(metrics.submitStyle.backgroundColor).toBe("rgb(23, 23, 23)");
  expect(metrics.bodyOverflow).toBe("hidden");

  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-full-page.png",
    fullPage: true,
  });
  await page.addStyleTag({
    content:
      ".lnb, .content-layer > :not(.modal) { visibility: hidden !important; }",
  });
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal.png",
    fullPage: true,
  });
  await page.locator(".feed-create-modal").screenshot({
    path: "tests/visual/actual/feed-create-modal-crop.png",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("피드 생성 Modal 상태와 긴 본문 Layout", async ({ page }) => {
  await prepare(page);
  await openModal(page);
  const textarea = page.getByLabel("피드 본문");
  const submit = page.getByRole("button", { name: "피드 게시", exact: true });
  await textarea.fill(" ");
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-validation.png",
    fullPage: true,
  });
  await textarea.fill("본문만 입력");
  await expect(submit).toBeEnabled();
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-body-only.png",
    fullPage: true,
  });
  await setReferenceImage(page);
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-image-and-body.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "선택한 이미지 제거" }).click();
  await expect(page.locator(".feed-editor__preview")).toHaveCount(0);
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-image-removed.png",
    fullPage: true,
  });

  await setReferenceImage(page);
  await textarea.fill(Array(13).fill(figmaContent).join("\n"));
  await expect(page.locator(".feed-create-modal")).toHaveCSS("height", "800px");
  await page.locator(".feed-create-modal").screenshot({
    path: "tests/visual/actual/feed-create-modal-long.png",
  });
});

test("피드 생성 Pending은 중복 요청을 막고 성공 후 닫힌다", async ({
  page,
}) => {
  const network = await prepare(page, { createDelay: 400 });
  await openModal(page);
  await page.getByLabel("피드 본문").fill("생성할 본문");
  const submit = page.getByRole("button", { name: "피드 게시", exact: true });
  await page.evaluate(() => {
    const button = document.querySelector('[aria-label="피드 게시"]');
    button.click();
    button.click();
    button.click();
  });
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-pending.png",
    fullPage: true,
  });
  await expect(page.getByRole("dialog", { name: "피드 생성" })).toHaveCount(0);
  expect(network.createCount()).toBe(1);
});

test("피드 생성 API 실패는 입력과 Preview를 유지한다", async ({ page }) => {
  const network = await prepare(page, { createFails: true });
  await openModal(page);
  await page.getByLabel("피드 본문").fill("재시도 본문");
  await setReferenceImage(page);
  await page.getByRole("button", { name: "피드 게시", exact: true }).click();
  await expect(page.getByText("서버 오류가 발생했습니다.")).toBeVisible();
  await expect(page.getByLabel("피드 본문")).toHaveValue("재시도 본문");
  await expect(page.locator(".feed-editor__preview")).toBeVisible();
  await page.screenshot({
    path: "tests/visual/actual/feed-create-modal-failure.png",
    fullPage: true,
  });
  expect(network.createCount()).toBe(1);
});

test("피드 생성 Modal은 Escape와 Backdrop으로 닫고 Trigger Focus를 복원한다", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/feed");
  const trigger = page.getByRole("button", { name: "피드 게시하기" });
  await trigger.focus();
  await trigger.click();
  await expect(page.getByRole("button", { name: "취소" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "피드 생성" })).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.locator(".modal").click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog", { name: "피드 생성" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 480, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`피드 생성 Modal 반응형 ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await openModal(page);
    await setReferenceImage(page);
    await page.getByLabel("피드 본문").fill(figmaContent.repeat(8));
    const layout = await page.evaluate(() => {
      const dialog = document
        .querySelector(".feed-create-modal")
        .getBoundingClientRect();
      const preview = document
        .querySelector(".feed-editor__preview")
        .getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        dialog: {
          left: dialog.left,
          right: dialog.right,
          top: dialog.top,
          bottom: dialog.bottom,
          width: dialog.width,
          height: dialog.height,
        },
        previewRatio: preview.width / preview.height,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.dialog.left).toBeGreaterThanOrEqual(16);
    expect(layout.dialog.right).toBeLessThanOrEqual(viewport.width - 16);
    expect(layout.dialog.top).toBeGreaterThanOrEqual(16);
    expect(layout.dialog.bottom).toBeLessThanOrEqual(viewport.height - 16);
    expect(layout.previewRatio).toBeCloseTo(448 / 288, 2);
    await page.screenshot({
      path: `tests/visual/actual/feed-create-modal-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  });
}
