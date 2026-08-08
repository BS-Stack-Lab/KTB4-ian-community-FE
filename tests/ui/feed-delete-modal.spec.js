import { expect, test } from "@playwright/test";

async function prepare(page, { fails = false, delay = 0 } = {}) {
  let deleteCount = 0;
  let posts = [
    {
      post_id: 31,
      user_id: 7,
      content: "삭제 검증 피드",
      author_name: "dlkfjs",
    },
  ];
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
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (path === "/api/csrf")
      return route.fulfill({
        status: 204,
        headers: { ...cors, "Set-Cookie": "XSRF-TOKEN=feed-delete; Path=/" },
      });
    if (path === "/api/users/me")
      return route.fulfill({
        json: { data: { user_id: 7, nickname: "dlkfjs" } },
        headers: cors,
      });
    if (path === "/api/v2/posts" && request.method() === "GET")
      return route.fulfill({
        json: { data: { content: posts } },
        headers: cors,
      });
    if (path === "/api/posts/31" && request.method() === "DELETE") {
      deleteCount += 1;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (fails)
        return route.fulfill({
          status: 500,
          json: { code: "INTERNAL_SERVER_ERROR", message: "internal detail" },
          headers: cors,
        });
      posts = [];
      return route.fulfill({ status: 204, headers: cors });
    }
    if (path.endsWith("/images/profile-default.svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        headers: cors,
      });
    return route.fulfill({ status: 204, headers: cors });
  });
  return { deleteCount: () => deleteCount };
}

async function open(page) {
  await page.goto("/feed");
  const card = page.locator(".post-card").filter({ hasText: "삭제 검증 피드" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "피드 옵션" }).click();
  await page.getByRole("menuitem", { name: "삭제하기" }).click();
  return page.getByRole("dialog", { name: "피드 삭제 확인" });
}

test("피드 삭제 Confirm은 Figma 구조와 수치, 기존 위험 Action 정책을 따른다", async ({
  page,
}) => {
  await prepare(page);
  const dialog = await open(page);
  await expect(dialog).toContainText("삭제된 피드는 복구할 수 없습니다.");
  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      dialog: rect(".delete-confirm-modal"),
      cancel: rect(".delete-confirm-modal .button--dark"),
      confirm: rect(".delete-confirm-modal .button--primary"),
      cancelBackground: getComputedStyle(
        document.querySelector(".delete-confirm-modal .button--dark"),
      ).backgroundColor,
      confirmBackground: getComputedStyle(
        document.querySelector(".delete-confirm-modal .button--primary"),
      ).backgroundColor,
      overflow: getComputedStyle(document.body).overflow,
    };
  });
  expect(metrics.dialog).toEqual({ x: 720, y: 434, width: 480, height: 212 });
  expect(metrics.cancel).toMatchObject({ width: 212, height: 48 });
  expect(metrics.confirm).toMatchObject({ width: 212, height: 48 });
  expect(metrics.cancelBackground).toBe("rgb(161, 161, 161)");
  expect(metrics.confirmBackground).toBe("rgb(91, 92, 235)");
  expect(metrics.overflow).toBe("hidden");
  await page.screenshot({
    path: "tests/visual/actual/feed-delete-confirm-modal-full-page.png",
    fullPage: true,
  });
  await dialog.screenshot({
    path: "tests/visual/actual/feed-delete-confirm-modal-crop.png",
  });
});

test("피드 삭제는 Pending 중 한 번만 호출하고 대상만 제거한다", async ({
  page,
}) => {
  const network = await prepare(page, { delay: 100 });
  const dialog = await open(page);
  const confirm = dialog.getByRole("button", { name: "확인" });
  await confirm.evaluate((button) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(confirm).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/feed-delete-confirm-pending.png",
    fullPage: true,
  });
  await expect(page.getByText("삭제 검증 피드")).toHaveCount(0);
  expect(network.deleteCount()).toBe(1);
});

test("피드 삭제 실패 시 Modal과 기존 피드를 유지한다", async ({ page }) => {
  const network = await prepare(page, { fails: true });
  const dialog = await open(page);
  await dialog.getByRole("button", { name: "확인" }).click();
  await expect(dialog).toContainText("서버 오류가 발생했습니다.");
  await expect(page.getByText("삭제 검증 피드")).toBeVisible();
  expect(network.deleteCount()).toBe(1);
  await page.screenshot({
    path: "tests/visual/actual/feed-delete-confirm-failure.png",
    fullPage: true,
  });
});
