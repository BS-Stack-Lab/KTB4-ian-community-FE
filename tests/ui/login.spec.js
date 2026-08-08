import { expect, test } from "@playwright/test";

async function prepare(page, { loginFails = false, delay = 0 } = {}) {
  let loginCount = 0;
  const consoleErrors = [];
  const expectedNetworkErrors = [];
  const failedAssets = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("Failed to load resource:"))
      expectedNetworkErrors.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      /\.(png|svg|jpg|jpeg|webp|woff2)(\?|$)/.test(response.url())
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
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (path === "/api/csrf")
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          "Set-Cookie": "XSRF-TOKEN=login-test; Path=/; SameSite=Lax",
        },
      });
    if (path === "/api/users/login") {
      loginCount += 1;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return loginFails
        ? route.fulfill({
            status: 401,
            json: {
              code: "INVALID_LOGIN_REQUEST",
              message: "이메일 또는 비밀번호를 확인해주세요.",
            },
            headers: cors,
          })
        : route.fulfill({
            json: { data: { user_id: 7, nickname: "pulse" } },
            headers: cors,
          });
    }
    if (path === "/api/users/me")
      return route.fulfill({
        json: { data: { user_id: 7, nickname: "pulse" } },
        headers: cors,
      });
    if (path === "/api/v2/posts")
      return route.fulfill({ json: { data: { content: [] } }, headers: cors });
    if (path.endsWith("/images/profile-default.svg"))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        headers: cors,
      });
    return route.fulfill({ status: 204, headers: cors });
  });
  return {
    loginCount: () => loginCount,
    consoleErrors,
    expectedNetworkErrors,
    failedAssets,
  };
}

async function ready(page) {
  await page.goto("/login");
  await expect(page.getByTestId("login-page-ready")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? undefined
          : new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            }),
      ),
    );
  });
}

test("로그인 Page는 Figma와 회원가입 Form 디자인 수치를 사용한다", async ({
  page,
}) => {
  const network = await prepare(page);
  await ready(page);
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
        color: value.color,
        backgroundColor: value.backgroundColor,
        borderColor: value.borderColor,
        borderRadius: value.borderRadius,
        fontSize: value.fontSize,
        fontWeight: value.fontWeight,
        lineHeight: value.lineHeight,
        letterSpacing: value.letterSpacing,
        padding: value.padding,
      };
    };
    return {
      artwork: rect(".auth-artwork"),
      panel: rect(".login-panel"),
      logo: rect(".login-panel .signup-panel__logo"),
      divider: rect(".login-panel .auth-divider"),
      input: rect(".login-panel input"),
      button: rect(".login-panel .signup-submit"),
      inputStyle: style(".login-panel input"),
      buttonStyle: style(".login-panel .signup-submit"),
      titleStyle: style(".login-panel .auth-divider h1"),
    };
  });
  expect(metrics.artwork).toEqual({ x: 0, y: 0, width: 960, height: 1080 });
  expect(metrics.panel).toMatchObject({ x: 1248, width: 343 });
  expect(metrics.logo).toMatchObject({ width: 239.328125, height: 37.5 });
  expect(metrics.divider.width).toBe(343);
  expect(metrics.input).toMatchObject({ width: 343, height: 44 });
  expect(metrics.button).toMatchObject({ width: 343, height: 48 });
  expect(metrics.inputStyle).toMatchObject({
    borderColor: "rgb(212, 212, 212)",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
    lineHeight: "20px",
    padding: "12px",
  });
  expect(metrics.titleStyle).toMatchObject({
    color: "rgb(115, 115, 115)",
    fontSize: "13px",
    fontWeight: "500",
    lineHeight: "18px",
  });
  await page.screenshot({
    path: "tests/visual/after/login.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("로그인 Button 상태와 성공·실패·중복 제출을 보존한다", async ({
  page,
}) => {
  const network = await prepare(page, { delay: 100 });
  await ready(page);
  const submit = page.getByRole("button", { name: "로그인", exact: true });
  await expect(submit).toBeDisabled();
  const disabledColor = await submit.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  expect(disabledColor).toBe("rgb(245, 245, 245)");
  await page.getByLabel("이메일").fill("pulse@example.com");
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS("background-color", disabledColor);
  await page.getByLabel("비밀번호").fill("Password1!");
  await expect(submit).toBeEnabled();
  await page.screenshot({
    path: "tests/visual/after/login-active.png",
    fullPage: true,
    animations: "disabled",
  });
  const enabledColor = await submit.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  expect(enabledColor).toBe("rgb(91, 92, 235)");
  expect(enabledColor).not.toBe(disabledColor);
  await submit.hover();
  const hoverColor = await submit.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  expect(hoverColor).not.toBe(enabledColor);
  await page.screenshot({
    path: "tests/visual/after/login-hover.png",
    fullPage: true,
    animations: "disabled",
  });
  await submit.focus();
  await page.screenshot({
    path: "tests/visual/after/login-focus.png",
    fullPage: true,
    animations: "disabled",
  });
  await submit.evaluate((button) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(submit).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/after/login-pending.png",
    fullPage: true,
    animations: "disabled",
  });
  await expect(page).toHaveURL(/\/feed$/);
  expect(network.loginCount()).toBe(1);
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("로그인 실패는 입력과 Page를 유지하고 회원가입은 SPA 이동한다", async ({
  page,
}) => {
  const network = await prepare(page, { loginFails: true });
  await ready(page);
  await page.getByLabel("이메일").fill("wrong@example.com");
  await page.getByLabel("비밀번호").fill("Wrong1!");
  const failureResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/users/login" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  expect((await failureResponse).status()).toBe(401);
  await expect(page.getByRole("alert")).toContainText(
    "이메일 또는 비밀번호를 확인해주세요.",
  );
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("이메일")).toHaveValue("wrong@example.com");
  await expect(page.getByLabel("비밀번호")).toHaveValue("Wrong1!");
  await page.screenshot({
    path: "tests/visual/after/login-error.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "회원가입 하러가기" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(network.consoleErrors).toEqual([]);
  expect(network.expectedNetworkErrors).toHaveLength(1);
  expect(network.failedAssets).toEqual([]);
});
