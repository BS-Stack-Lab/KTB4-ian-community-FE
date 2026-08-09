import { expect, test } from "@playwright/test";

const user = {
  user_id: 7,
  email: "pulse@example.com",
  nickname: "dlkfjs",
  profile_image: "/images/profile-default.svg",
};
const initialContent =
  "분위기 좋은 다로베에서 화덕피자 먹고, 도보 5분 거리 재즈바 '포지티브 제로'로 이동하세요. 조명이 예뻐서 서로 더 예뻐 보이는 마법의 코스입니다. (예약 필수!)";

async function prepare(page, { updateFails = false, updateDelay = 0 } = {}) {
  let updateCount = 0;
  let content = initialContent;
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
          "Set-Cookie": "XSRF-TOKEN=feed-edit-test; Path=/; SameSite=Lax",
        },
      });
    if (url.pathname === "/api/users/me")
      return route.fulfill({ json: { data: user }, headers: cors });
    if (url.pathname === "/api/v2/posts" && request.method() === "GET")
      return route.fulfill({
        json: {
          data: {
            content: [
              {
                post_id: 31,
                user_id: 7,
                content,
                author_name: "dlkfjs",
                profile_image: "/images/profile-default.svg",
                image_url: "/images/feed/edit-fixture.jpg",
              },
            ],
          },
        },
        headers: cors,
      });
    if (url.pathname === "/api/v2/media/uploads" && request.method() === "POST")
      return route.fulfill({
        json: {
          data: {
            mediaId: "feed-edit-media",
            status: "PENDING_UPLOAD",
            upload: {
              url: "http://127.0.0.1:8080/test-media-upload",
              fields: { key: "private/uploads/feed-edit-media/source" },
            },
          },
        },
        headers: cors,
      });
    if (url.pathname === "/test-media-upload" && request.method() === "POST")
      return route.fulfill({ status: 204, headers: cors });
    if (
      url.pathname === "/api/v2/media/feed-edit-media/complete" &&
      request.method() === "POST"
    )
      return route.fulfill({
        json: {
          data: {
            mediaId: "feed-edit-media",
            status: "READY",
            frame: "POST_LANDSCAPE",
            mediaRevision: 1,
            transformVersion: 1,
            variants: [
              {
                type: "POST_LANDSCAPE_3X",
                url: "/images/feed/edit-fixture.jpg",
                width: 1344,
                height: 864,
                mimeType: "image/webp",
                fileSize: 1024,
              },
            ],
          },
        },
        headers: cors,
      });
    if (url.pathname === "/api/posts/31" && request.method() === "PATCH") {
      updateCount += 1;
      if (updateDelay)
        await new Promise((resolve) => setTimeout(resolve, updateDelay));
      if (updateFails)
        return route.fulfill({
          status: 500,
          json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
          headers: cors,
        });
      content = request.postDataJSON().content;
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/images/profile-default.svg")
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
    updateCount: () => updateCount,
    consoleErrors,
    failedAssets,
  };
}

async function openModal(page) {
  await page.goto("/feed");
  await expect(page.getByTestId("feed-content")).toHaveClass(/is-visible/);
  await expect(page.getByRole("article")).toContainText(initialContent);
  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal-closed-page.png",
    fullPage: true,
  });
  await page
    .locator(".post-card")
    .getByRole("button", { name: "피드 옵션" })
    .click();
  await page.getByRole("menuitem", { name: "수정하기" }).click();
  await expect(page.getByRole("dialog", { name: "피드 편집" })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

test("피드 수정 Modal은 Figma 구조와 수치로 렌더링된다", async ({ page }) => {
  const network = await prepare(page);
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "피드 편집" });
  await expect(dialog.locator(".feed-editor__preview")).toHaveAttribute(
    "data-preview-kind",
    "original-legacy",
  );
  await expect(dialog.getByLabel("피드 본문")).toHaveValue(initialContent);

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
      dialog: rect(".feed-edit-modal"),
      header: rect(".feed-edit-modal .modal-header"),
      editor: rect(".feed-edit-modal .feed-editor"),
      preview: rect(".feed-edit-modal .feed-editor__preview"),
      footer: rect(".feed-edit-modal .editor-footer"),
      avatar: rect(".feed-edit-modal .user-avatar"),
      dialogStyle: style(".feed-edit-modal"),
      backdropStyle: style(".modal"),
      textareaStyle: style(".feed-edit-modal textarea"),
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  expect(metrics.dialog).toEqual({ x: 720, y: 281, width: 480, height: 518 });
  expect(metrics.header.height).toBe(52);
  expect(metrics.editor.height).toBe(410);
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
  expect(metrics.bodyOverflow).toBe("hidden");

  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal-full-page.png",
    fullPage: true,
  });
  await page.addStyleTag({
    content:
      ".lnb, .content-layer > :not(.modal) { visibility: hidden !important; }",
  });
  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal.png",
    fullPage: true,
  });
  await dialog.screenshot({
    path: "tests/visual/actual/feed-edit-modal-crop.png",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("변경 상태, Blob Preview, 제거 상태를 구분한다", async ({ page }) => {
  await prepare(page);
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "피드 편집" });
  const textarea = dialog.getByLabel("피드 본문");
  const submit = dialog.getByRole("button", { name: "피드 수정" });
  await expect(submit).toBeDisabled();
  await textarea.fill(" ");
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal-validation.png",
    fullPage: true,
  });
  await textarea.fill("수정할 본문");
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveCSS("background-color", "rgb(23, 23, 23)");
  await expect(dialog.getByAltText("피드 이미지 미리보기")).toHaveAttribute(
    "draggable",
    "false",
  );
  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal-body-changed.png",
    fullPage: true,
  });
  await textarea.fill(initialContent);
  await dialog
    .locator('input[type="file"]')
    .setInputFiles("tests/fixtures/feed-create-reference.jpg");
  const imageEditor = page.getByRole("dialog", { name: "이미지 편집" });
  await expect(imageEditor).toBeVisible();
  await imageEditor.getByRole("button", { name: "이미지 첨부" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "피드 편집" });
  await expect(reopenedDialog).toBeVisible();
  await expect(reopenedDialog.locator(".feed-editor__preview")).toHaveAttribute(
    "data-preview-kind",
    "new",
  );
  await expect(
    reopenedDialog.getByRole("button", { name: "피드 수정" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal-blob-preview.png",
    fullPage: true,
  });
  await reopenedDialog
    .getByRole("button", { name: "피드 이미지 제거" })
    .click();
  await expect(reopenedDialog.locator(".feed-editor__preview")).toHaveCount(0);
  await expect(
    reopenedDialog.getByRole("button", { name: "피드 수정" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal-image-removed.png",
    fullPage: true,
  });
});

test("Pending 중 중복 제출을 막고 성공 후 해당 피드를 갱신한다", async ({
  page,
}) => {
  const network = await prepare(page, { updateDelay: 150 });
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "피드 편집" });
  await dialog.getByLabel("피드 본문").fill("저장된 수정 본문");
  const submit = dialog.getByRole("button", { name: "피드 수정" });
  await submit.evaluate((button) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal-pending.png",
    fullPage: true,
  });
  await expect(dialog).toBeHidden();
  await expect(page.locator(".post-card")).toContainText("저장된 수정 본문");
  expect(network.updateCount()).toBe(1);
});

test("API 실패 시 Modal과 입력값을 유지한다", async ({ page }) => {
  const network = await prepare(page, { updateFails: true });
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "피드 편집" });
  await dialog.getByLabel("피드 본문").fill("실패 후 유지할 본문");
  await dialog.getByRole("button", { name: "피드 수정" }).click();
  await expect(dialog).toContainText("서버 오류가 발생했습니다.");
  await expect(dialog.getByLabel("피드 본문")).toHaveValue(
    "실패 후 유지할 본문",
  );
  await page.screenshot({
    path: "tests/visual/actual/feed-edit-modal-failure.png",
    fullPage: true,
  });
  expect(network.updateCount()).toBe(1);
});

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 480, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`피드 수정 Modal ${viewport.width}×${viewport.height} 반응형`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await openModal(page);
    const box = await page
      .getByRole("dialog", { name: "피드 편집" })
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
