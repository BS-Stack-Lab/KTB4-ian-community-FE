import { expect, test } from "@playwright/test";

async function prepare(page, { fails = false, delay = 0 } = {}) {
  let requestCount = 0;
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
          "Set-Cookie": "XSRF-TOKEN=password-test; Path=/; SameSite=Lax",
        },
      });
    if (url.pathname === "/api/users/me" && request.method() === "GET")
      return route.fulfill({
        json: {
          data: { user_id: 7, email: "email@email.com", nickname: "dlkfjs" },
        },
        headers: cors,
      });
    if (url.pathname === "/api/v2/posts")
      return route.fulfill({ json: { data: { content: [] } }, headers: cors });
    if (url.pathname === "/api/users/7/password") {
      requestCount += 1;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (fails)
        return route.fulfill({
          status: 400,
          json: {
            code: "CURRENT_PASSWORD_MISMATCH",
            message: "현재 비밀번호가 일치하지 않습니다.",
          },
          headers: cors,
        });
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname.endsWith("/images/profile-default.svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        headers: cors,
      });
    return route.fulfill({ status: 204, headers: cors });
  });
  return { requestCount: () => requestCount };
}

async function openModal(page) {
  await page.goto("/feed");
  await expect(page.getByTestId("feed-content")).toHaveClass(/is-visible/);
  await page.screenshot({
    path: "tests/visual/actual/password-edit-modal-closed-page.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "비밀번호 변경", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "비밀번호 변경" }),
  ).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

async function fillValid(dialog) {
  await dialog.getByLabel("현재 비밀번호").fill("Signup123!");
  await dialog.getByLabel("새 비밀번호", { exact: true }).fill("Changed123!");
  await dialog.getByLabel("새 비밀번호 확인").fill("Changed123!");
}

test("비밀번호 변경 Modal은 Figma 구조와 수치로 렌더링된다", async ({
  page,
}) => {
  await prepare(page);
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "비밀번호 변경" });
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
      };
    };
    return {
      dialog: rect(".password-edit-modal"),
      header: rect(".password-edit-modal .profile-edit-header"),
      editor: rect(".password-editor"),
      input: rect(".password-editor input"),
      button: rect(".password-editor > button"),
      dialogStyle: style(".password-edit-modal"),
      inputStyle: style(".password-editor input"),
    };
  });
  expect(metrics.dialog).toEqual({ x: 720, y: 370, width: 480, height: 340 });
  expect(metrics.header.height).toBe(64);
  expect(metrics.editor.height).toBe(276);
  expect(metrics.input).toMatchObject({ width: 448, height: 44 });
  expect(metrics.button).toMatchObject({ width: 448, height: 48 });
  expect(metrics.dialogStyle).toMatchObject({
    borderRadius: "30px",
    borderWidth: "0px",
  });
  expect(metrics.inputStyle).toMatchObject({
    borderRadius: "8px",
    borderWidth: "1px",
    padding: "12px",
    fontSize: "14px",
    fontWeight: "500",
    lineHeight: "20px",
  });
  await page.screenshot({
    path: "tests/visual/actual/password-edit-modal-full-page.png",
    fullPage: true,
  });
  await page.addStyleTag({
    content:
      ".lnb, .content-layer > :not(.modal) { visibility: hidden !important; }",
  });
  await page.screenshot({
    path: "tests/visual/actual/password-edit-modal.png",
    fullPage: true,
  });
  await dialog.screenshot({
    path: "tests/visual/actual/password-edit-modal-crop.png",
  });
});

test("Validation과 활성 상태를 구분한다", async ({ page }) => {
  await prepare(page);
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "비밀번호 변경" });
  const submit = dialog.getByRole("button", { name: "변경하기" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("현재 비밀번호").fill("Signup123!");
  await dialog.getByLabel("새 비밀번호", { exact: true }).fill("Signup123!");
  await dialog.getByLabel("새 비밀번호 확인").fill("Signup123!");
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/password-edit-modal-validation.png",
    fullPage: true,
  });
  await fillValid(dialog);
  await expect(submit).toBeEnabled();
  await page.screenshot({
    path: "tests/visual/actual/password-edit-modal-enabled.png",
    fullPage: true,
  });
});

test("Pending 중 중복 요청을 막고 실패하면 입력을 유지한다", async ({
  page,
}) => {
  const network = await prepare(page, { fails: true, delay: 100 });
  await openModal(page);
  const dialog = page.getByRole("dialog", { name: "비밀번호 변경" });
  await fillValid(dialog);
  const submit = dialog.getByRole("button", { name: "변경하기" });
  await submit.evaluate((button) => {
    button.click();
    button.click();
    button.click();
  });
  await page.screenshot({
    path: "tests/visual/actual/password-edit-modal-pending.png",
    fullPage: true,
  });
  await expect(dialog).toContainText("현재 비밀번호가 일치하지 않습니다.");
  await expect(dialog.getByLabel("현재 비밀번호")).toHaveValue("Signup123!");
  await page.screenshot({
    path: "tests/visual/actual/password-edit-modal-failure.png",
    fullPage: true,
  });
  expect(network.requestCount()).toBe(1);
});

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 480, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`비밀번호 변경 Modal ${viewport.width}×${viewport.height} 반응형`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await openModal(page);
    const box = await page
      .getByRole("dialog", { name: "비밀번호 변경" })
      .boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
  });
}
