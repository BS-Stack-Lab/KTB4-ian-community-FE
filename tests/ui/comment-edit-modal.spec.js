import { expect, test } from "@playwright/test";

const initialComment =
  "분위기 좋은 다로베에서 화덕피자 먹고, 도보 5분 거리 재즈바 '포지티브 제로'로 이동하세요. 조명이 예뻐서 서로 더 예뻐 보이는 마법의 코스입니다. (예약 필수!)";

async function prepare(page, { updateFails = false, updateDelay = 0 } = {}) {
  let updateCount = 0;
  let comment = initialComment;
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
          "Set-Cookie": "XSRF-TOKEN=comment-edit-test; Path=/; SameSite=Lax",
        },
      });
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          data: {
            user_id: 7,
            nickname: "dlkfjs",
            profile_image: "/images/profile-default.svg",
          },
        },
        headers: cors,
      });
    if (url.pathname === "/api/v2/posts/31" && request.method() === "GET")
      return route.fulfill({
        json: {
          data: {
            post_id: 31,
            content: "상세 피드",
            nickname: "다른 작성자",
            profile_image: "/images/profile-default.svg",
            comment: [
              {
                comment_id: 41,
                post_id: 31,
                user_id: 7,
                comment,
                nickname: "dlkfjs",
                profile_image: "/images/profile-default.svg",
              },
            ],
          },
        },
        headers: cors,
      });
    if (
      url.pathname === "/api/posts/31/comments/41/users/me" &&
      request.method() === "PATCH"
    ) {
      updateCount += 1;
      if (updateDelay)
        await new Promise((resolve) => setTimeout(resolve, updateDelay));
      if (updateFails)
        return route.fulfill({
          status: 500,
          json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
          headers: cors,
        });
      comment = request.postDataJSON().comment;
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/images/profile-default.svg")
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#fff"/><circle cx="60" cy="44" r="20" fill="#a1a1a1"/><path d="M24 104c4-24 18-36 36-36s32 12 36 36" fill="#a1a1a1"/></svg>',
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
  await page.goto("/posts/31");
  await expect(page.getByText(initialComment)).toBeVisible();
  await page.screenshot({
    path: "tests/visual/actual/comment-edit-modal-closed-page.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "댓글 옵션" }).click();
  await page.getByRole("menuitem", { name: "수정하기" }).click();
  await expect(page.getByRole("dialog", { name: "댓글" })).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

test("댓글 수정 Modal은 Figma 구조와 수치로 렌더링된다", async ({ page }) => {
  const network = await prepare(page);
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "댓글" });
  await expect(dialog.getByLabel("댓글 내용")).toHaveValue(initialComment);
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
      };
    };
    return {
      dialog: rect(".comment-edit-modal"),
      header: rect(".comment-edit-modal .modal-header"),
      editor: rect(".comment-editor"),
      textarea: rect(".comment-editor textarea"),
      footer: rect(".comment-editor-footer"),
      avatar: rect(".comment-edit-modal .user-avatar"),
      dialogStyle: style(".comment-edit-modal"),
      textareaStyle: style(".comment-editor textarea"),
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  expect(metrics.dialog).toEqual({ x: 720, y: 367, width: 480, height: 346 });
  expect(metrics.header.height).toBe(52);
  expect(metrics.editor.height).toBe(238);
  expect(metrics.textarea).toMatchObject({ width: 448, height: 160 });
  expect(metrics.footer.height).toBe(56);
  expect(metrics.avatar).toMatchObject({ width: 34, height: 34 });
  expect(metrics.dialogStyle).toMatchObject({
    borderRadius: "30px",
    borderWidth: "0px",
  });
  expect(metrics.textareaStyle).toMatchObject({
    borderRadius: "8px",
    borderWidth: "1px",
    padding: "8px",
    fontSize: "12px",
    fontWeight: "400",
    lineHeight: "18px",
  });
  expect(metrics.bodyOverflow).toBe("hidden");
  await page.screenshot({
    path: "tests/visual/actual/comment-edit-modal-full-page.png",
    fullPage: true,
  });
  await page.addStyleTag({
    content: ".lnb, .page > :not(.modal) { visibility: hidden !important; }",
  });
  await page.screenshot({
    path: "tests/visual/actual/comment-edit-modal.png",
    fullPage: true,
  });
  await dialog.screenshot({
    path: "tests/visual/actual/comment-edit-modal-crop.png",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("변경 없음과 공백은 비활성이고 정상 변경만 활성화된다", async ({
  page,
}) => {
  await prepare(page);
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "댓글" });
  const textarea = dialog.getByLabel("댓글 내용");
  const submit = dialog.getByRole("button", { name: "댓글 수정" });
  await expect(submit).toBeDisabled();
  await textarea.fill(" ");
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/comment-edit-modal-validation.png",
    fullPage: true,
  });
  await textarea.fill("수정할 댓글");
  await expect(submit).toBeEnabled();
  await page.screenshot({
    path: "tests/visual/actual/comment-edit-modal-enabled.png",
    fullPage: true,
  });
});

test("Pending 중 중복 요청을 막고 해당 댓글만 갱신한다", async ({ page }) => {
  const network = await prepare(page, { updateDelay: 150 });
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "댓글" });
  await dialog.getByLabel("댓글 내용").fill("저장된 수정 댓글");
  const submit = dialog.getByRole("button", { name: "댓글 수정" });
  await submit.evaluate((button) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/comment-edit-modal-pending.png",
    fullPage: true,
  });
  await expect(dialog).toBeHidden();
  await expect(page.getByText("저장된 수정 댓글")).toBeVisible();
  expect(network.updateCount()).toBe(1);
});

test("실패하면 Modal과 입력을 유지한다", async ({ page }) => {
  const network = await prepare(page, { updateFails: true });
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "댓글" });
  await dialog.getByLabel("댓글 내용").fill("실패 후 유지 댓글");
  await dialog.getByRole("button", { name: "댓글 수정" }).click();
  await expect(dialog).toContainText("서버 오류가 발생했습니다.");
  await expect(dialog.getByLabel("댓글 내용")).toHaveValue("실패 후 유지 댓글");
  await page.screenshot({
    path: "tests/visual/actual/comment-edit-modal-failure.png",
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
  test(`댓글 수정 Modal ${viewport.width}×${viewport.height} 반응형`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await openModal(page);
    const box = await page.getByRole("dialog", { name: "댓글" }).boundingBox();
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
