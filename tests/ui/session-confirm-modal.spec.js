import { expect, test } from "@playwright/test";

async function prepare(page, { fails = false, delay = 0 } = {}) {
  let logoutCount = 0;
  let deleteCount = 0;
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
        headers: { ...cors, "Set-Cookie": "XSRF-TOKEN=confirm-test; Path=/" },
      });
    if (url.pathname === "/api/users/me" && request.method() === "GET")
      return route.fulfill({
        json: { data: { user_id: 7, nickname: "dlkfjs" } },
        headers: cors,
      });
    if (url.pathname === "/api/v2/posts")
      return route.fulfill({ json: { data: { content: [] } }, headers: cors });
    if (url.pathname === "/api/users/logout") {
      logoutCount += 1;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return fails
        ? route.fulfill({
            status: 500,
            json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
            headers: cors,
          })
        : route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/api/users/7/delete") {
      deleteCount += 1;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return fails
        ? route.fulfill({
            status: 500,
            json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
            headers: cors,
          })
        : route.fulfill({ status: 204, headers: cors });
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
  return { logoutCount: () => logoutCount, deleteCount: () => deleteCount };
}

async function open(page, action) {
  await page.goto("/feed");
  await expect(page.getByTestId("feed-content")).toHaveClass(/is-visible/);
  if (action === "회원탈퇴") {
    await page
      .locator(".lnb")
      .getByRole("button", { name: "프로필 편집", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "프로필 편집" })
      .getByRole("button", { name: "회원탈퇴", exact: true })
      .click();
  } else {
    await page.getByRole("button", { name: action, exact: true }).click();
  }
  return page.getByRole("dialog", { name: `${action} 확인` });
}

test("회원탈퇴 Confirm은 Figma 수치와 Primary/Outline 규칙을 따른다", async ({
  page,
}) => {
  await prepare(page);
  const dialog = await open(page, "회원탈퇴");
  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const buttons = document.querySelectorAll(".session-confirm-modal button");
    return {
      dialog: rect(".session-confirm-modal"),
      cancel: rect(".session-confirm-modal .button--outline"),
      confirm: rect(".session-confirm-modal .button--primary"),
      cancelBackground: getComputedStyle(buttons[0]).backgroundColor,
      confirmBackground: getComputedStyle(buttons[1]).backgroundColor,
    };
  });
  expect(metrics.dialog).toMatchObject({ width: 480, height: 180 });
  expect(metrics.cancel).toMatchObject({ width: 212, height: 48 });
  expect(metrics.confirm).toMatchObject({ width: 212, height: 48 });
  expect(metrics.cancelBackground).not.toBe(metrics.confirmBackground);
  await page.screenshot({
    path: "tests/visual/actual/account-delete-confirm-modal-full-page.png",
    fullPage: true,
  });
  await dialog.screenshot({
    path: "tests/visual/actual/account-delete-confirm-modal-crop.png",
  });
  await dialog.getByRole("button", { name: "취소" }).focus();
  await page.screenshot({
    path: "tests/visual/actual/account-delete-confirm-cancel-focus.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "확인" }).focus();
  await page.screenshot({
    path: "tests/visual/actual/account-delete-confirm-primary-focus.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "확인" }).hover();
  await page.screenshot({
    path: "tests/visual/actual/account-delete-confirm-primary-hover.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "확인" }).dispatchEvent("mousedown");
  await page.screenshot({
    path: "tests/visual/actual/account-delete-confirm-primary-active.png",
    fullPage: true,
  });
});

for (const action of ["로그아웃", "회원탈퇴"]) {
  test(`${action}은 Pending 중 한 번만 요청하고 성공 후 login으로 이동한다`, async ({
    page,
  }) => {
    const network = await prepare(page, { delay: 100 });
    const dialog = await open(page, action);
    await page.screenshot({
      path: `tests/visual/actual/${action === "로그아웃" ? "logout" : "account-delete"}-confirm-modal-full-page.png`,
      fullPage: true,
    });
    const confirm = dialog.getByRole("button", { name: "확인" });
    await confirm.evaluate((button) => {
      button.click();
      button.click();
      button.click();
    });
    await expect(confirm).toBeDisabled();
    await page.screenshot({
      path: `tests/visual/actual/${action === "로그아웃" ? "logout" : "account-delete"}-confirm-pending.png`,
      fullPage: true,
    });
    await expect(page).toHaveURL(/\/login$/);
    expect(
      action === "로그아웃" ? network.logoutCount() : network.deleteCount(),
    ).toBe(1);
  });

  test(`${action} 실패 시 Modal과 인증 상태를 유지한다`, async ({ page }) => {
    const network = await prepare(page, { fails: true });
    const dialog = await open(page, action);
    await dialog.getByRole("button", { name: "확인" }).click();
    await expect(dialog).toContainText("서버 오류가 발생했습니다.");
    await page.screenshot({
      path: `tests/visual/actual/${action === "로그아웃" ? "logout" : "account-delete"}-confirm-failure.png`,
      fullPage: true,
    });
    await expect(page).toHaveURL(/\/feed$/);
    expect(
      action === "로그아웃" ? network.logoutCount() : network.deleteCount(),
    ).toBe(1);
  });
}
