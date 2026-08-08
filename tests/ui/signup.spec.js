import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const validUser = {
  email: "signup@example.com",
  password: "Signup123!",
  nickname: "신규사용자",
};

async function mockSignupApi(
  page,
  { error, delay = 0, authenticated = false } = {},
) {
  let signupRequests = 0;
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
  await page.addInitScript((isAuthenticated) => {
    sessionStorage.clear();
    localStorage.clear();
    if (isAuthenticated) {
      sessionStorage.setItem("userId", "7");
      sessionStorage.setItem(
        "community.user",
        JSON.stringify({ userId: 7, nickname: "인증사용자" }),
      );
    }
  }, authenticated);
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
          "Set-Cookie": "XSRF-TOKEN=signup-test; Path=/; SameSite=Lax",
        },
      });
    if (url.pathname === "/api/users/signup") {
      signupRequests += 1;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (error)
        return route.fulfill({
          status: 409,
          json: {
            code:
              error === "email_already_exists"
                ? "EMAIL_ALREADY_EXISTS"
                : "NICKNAME_ALREADY_EXISTS",
            message: error,
            data: null,
          },
          headers: cors,
        });
      return route.fulfill({
        status: 200,
        json: { user_id: 7 },
        headers: {
          ...cors,
          "Set-Cookie": "accessToken=mock-access; Path=/; SameSite=Lax",
        },
      });
    }
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        status: 200,
        json: {
          user_id: 7,
          email: validUser.email,
          nickname: validUser.nickname,
          profile_image: "/images/me.png",
        },
        headers: cors,
      });
    if (url.pathname === "/api/v2/posts")
      return route.fulfill({
        status: 200,
        json: { data: { content: [] } },
        headers: cors,
      });
    if (/\.(png|svg)$/.test(url.pathname))
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"/>',
        headers: cors,
      });
    return route.fulfill({ status: 204, headers: cors });
  });
  return {
    signupCount: () => signupRequests,
    consoleErrors,
    failedAssets,
  };
}

async function waitForStableSignup(page) {
  await expect(page.getByTestId("signup-page-ready")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((image) => {
        if (image.complete) return undefined;
        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }),
    );
  });
}

async function fillValidSignup(page) {
  await page.getByLabel("이메일").fill(validUser.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(validUser.password);
  await page.getByLabel("비밀번호 확인").fill(validUser.password);
  await page.getByLabel("닉네임").fill(validUser.nickname);
}

test("회원가입 기본 UI는 Figma 수치와 일치한다", async ({ page }) => {
  const network = await mockSignupApi(page);
  await page.goto("/signup");
  await waitForStableSignup(page);

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
        fontFamily: value.fontFamily,
      };
    };
    return {
      panel: rect(".signup-panel"),
      logo: rect(".signup-panel__logo"),
      artwork: rect(".auth-artwork"),
      divider: rect(".auth-divider"),
      input: rect(".signup-field input"),
      inputStyle: style(".signup-field input"),
      submit: rect(".signup-submit"),
      switchButton: rect(".auth-switch"),
      submitStyle: style(".signup-submit"),
      fieldsGap: getComputedStyle(
        document.querySelector(".signup-form__fields"),
      ).gap,
    };
  });

  expect(metrics.panel.width).toBe(343);
  expect(metrics.panel.x).toBeCloseTo(1248, 1);
  expect(metrics.input.height).toBe(44);
  expect(metrics.fieldsGap).toBe("8px");
  expect(metrics.submit).toMatchObject({ width: 343, height: 48 });
  expect(metrics.logo.width).toBeCloseTo(239.329, 1);
  expect(metrics.logo.height).toBeCloseTo(37.5, 1);
  expect(metrics.artwork).toEqual({ x: 0, y: 0, width: 960, height: 1080 });
  expect(metrics.divider.width).toBe(343);
  expect(metrics.switchButton.width).toBe(343);
  expect(metrics.inputStyle).toMatchObject({
    color: "rgb(23, 23, 23)",
    backgroundColor: "rgb(255, 255, 255)",
    borderColor: "rgb(212, 212, 212)",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
    lineHeight: "20px",
  });
  expect(metrics.inputStyle.fontFamily).toContain("Wanted Sans");
  expect(metrics.submitStyle.borderRadius).toBe("8px");
  expect(metrics.submitStyle.backgroundColor).toBe("rgb(245, 245, 245)");
  const figma = {
    viewport: { width: 1920, height: 1080 },
    panel: { x: 1248, width: 343 },
    artwork: { x: 0, y: 0, width: 960, height: 1080 },
    logo: { width: 239.329, height: 37.5 },
    input: { width: 343, height: 44 },
    submit: { width: 343, height: 48 },
  };
  await mkdir("tests/visual/report", { recursive: true });
  await writeFile(
    "tests/visual/report/signup-default.metrics.json",
    `${JSON.stringify(
      {
        figmaNode: "544:2271",
        figma,
        actual: metrics,
        deltas: {
          panelX: metrics.panel.x - figma.panel.x,
          panelWidth: metrics.panel.width - figma.panel.width,
          logoWidth: metrics.logo.width - figma.logo.width,
          logoHeight: metrics.logo.height - figma.logo.height,
          inputWidth: metrics.input.width - figma.input.width,
          inputHeight: metrics.input.height - figma.input.height,
          submitWidth: metrics.submit.width - figma.submit.width,
          submitHeight: metrics.submit.height - figma.submit.height,
        },
      },
      null,
      2,
    )}\n`,
  );
  await page.screenshot({
    path: "tests/visual/actual/signup-default.png",
    fullPage: true,
  });
  expect(network.consoleErrors).toEqual([]);
  expect(network.failedAssets).toEqual([]);
});

test("회원가입 Input과 Button 상호작용 상태는 디자인 토큰을 사용한다", async ({
  page,
}) => {
  await mockSignupApi(page, { delay: 1_000 });
  await page.goto("/signup");
  await waitForStableSignup(page);
  const email = page.getByLabel("이메일");
  const submit = page.getByRole("button", { name: "회원가입", exact: true });

  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS("background-color", "rgb(245, 245, 245)");
  await email.focus();
  await expect(email).toHaveCSS("border-color", "rgb(91, 92, 235)");

  await email.fill("invalid");
  await email.blur();
  await expect(email).toHaveCSS("border-color", "rgb(255, 24, 24)");
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS("background-color", "rgb(245, 245, 245)");
  await fillValidSignup(page);
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveCSS("background-color", "rgb(91, 92, 235)");

  await submit.hover();
  await expect(submit).toHaveCSS("background-color", "rgb(145, 146, 242)");
  await page.screenshot({
    path: "tests/visual/actual/signup-submit-hover.png",
    fullPage: true,
  });

  await submit.focus();
  await expect(submit).toBeFocused();
  await expect(submit).toHaveCSS("outline-color", "rgb(145, 146, 242)");
  await page.screenshot({
    path: "tests/visual/actual/signup-submit-focus.png",
    fullPage: true,
  });

  const box = await submit.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(submit).toHaveCSS("background-color", "rgb(65, 65, 167)");
  await page.screenshot({
    path: "tests/visual/actual/signup-submit-active.png",
    fullPage: true,
  });
  await page.mouse.up();
});

test("회원가입 Focus, Error, 정상 입력, Pending, 서버 오류 상태", async ({
  page,
}) => {
  const network = await mockSignupApi(page, { delay: 350 });
  await page.goto("/signup");
  await waitForStableSignup(page);
  await page.screenshot({
    path: "tests/visual/actual/signup-empty.png",
    fullPage: true,
  });

  const email = page.getByLabel("이메일");
  await email.focus();
  await expect(email).toBeFocused();
  await page.screenshot({
    path: "tests/visual/actual/signup-focus.png",
    fullPage: true,
  });

  await email.fill("invalid");
  await email.blur();
  await expect(page.getByText("올바른 이메일 형식이 아닙니다.")).toBeVisible();
  await page.screenshot({
    path: "tests/visual/actual/signup-validation-error.png",
    fullPage: true,
  });

  await fillValidSignup(page);
  const submit = page.getByRole("button", { name: "회원가입", exact: true });
  await expect(submit).toBeEnabled();
  await page.screenshot({
    path: "tests/visual/actual/signup-complete.png",
    fullPage: true,
  });

  await submit.click();
  await expect(page.getByRole("button", { name: "가입 중" })).toBeDisabled();
  await page.screenshot({
    path: "tests/visual/actual/signup-pending.png",
    fullPage: true,
  });
  await expect(page).toHaveURL(/\/feed$/);
  expect(network.signupCount()).toBe(1);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 480, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`회원가입 반응형 ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockSignupApi(page);
    await page.goto("/signup");
    await waitForStableSignup(page);
    const layout = await page.evaluate(() => {
      const pageRect = document
        .querySelector(".signup-page")
        .getBoundingClientRect();
      const panelRect = document
        .querySelector(".signup-panel")
        .getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        pageHeight: pageRect.height,
        panelLeft: panelRect.left,
        panelRight: panelRect.right,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.panelLeft).toBeGreaterThanOrEqual(0);
    expect(layout.panelRight).toBeLessThanOrEqual(layout.viewportWidth);
    await page.screenshot({
      path: `tests/visual/actual/signup-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  });
}

test("정상 회원가입은 Cookie 인증 후 feed로 이동한다", async ({
  page,
  context,
}) => {
  const network = await mockSignupApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "회원가입 하러가기" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await fillValidSignup(page);
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(
    page.locator(".create-trigger").getByAltText("신규사용자 프로필"),
  ).toBeVisible();
  expect(network.signupCount()).toBe(1);
  expect(
    (await context.cookies()).some((cookie) => cookie.name === "accessToken"),
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("회원가입 요청 전 Validation 실패는 Page와 입력을 유지한다", async ({
  page,
}) => {
  const network = await mockSignupApi(page);
  await page.goto("/signup");
  await page.getByLabel("이메일").fill("invalid");
  await page.getByLabel("이메일").blur();
  await expect(page.getByText("올바른 이메일 형식이 아닙니다.")).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByLabel("이메일")).toHaveValue("invalid");
  expect(network.signupCount()).toBe(0);
});

for (const scenario of [
  {
    code: "email_already_exists",
    message: "이미 사용 중인 이메일입니다.",
  },
  {
    code: "nickname_already_exists",
    message: "이미 사용 중인 닉네임입니다.",
  },
]) {
  test(`회원가입 서버 오류 ${scenario.code}`, async ({ page }) => {
    await mockSignupApi(page, { error: scenario.code });
    await page.goto("/signup");
    await fillValidSignup(page);
    await page.getByRole("button", { name: "회원가입", exact: true }).click();
    await expect(page.getByText(scenario.message)).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByLabel("이메일")).toHaveValue(validUser.email);
    await expect(page.getByLabel("닉네임")).toHaveValue(validUser.nickname);
    await page.screenshot({
      path: `tests/visual/actual/signup-${scenario.code}.png`,
      fullPage: true,
    });
  });
}

test("회원가입 중복 제출은 API를 한 번만 호출한다", async ({ page }) => {
  const network = await mockSignupApi(page, { delay: 300 });
  await page.goto("/signup");
  await fillValidSignup(page);
  await page.evaluate(() => {
    const button = document.querySelector(".signup-submit");
    button.click();
    button.click();
    button.click();
  });
  await expect(page).toHaveURL(/\/feed$/);
  expect(network.signupCount()).toBe(1);
});

test("회원가입 직접 접근과 새로고침이 정상 동작한다", async ({ page }) => {
  await mockSignupApi(page);
  await page.goto("/signup");
  await waitForStableSignup(page);
  await page.reload();
  await waitForStableSignup(page);
  await expect(page).toHaveURL(/\/signup$/);
});

test("인증 사용자의 회원가입 접근은 feed로 replace 이동한다", async ({
  page,
}) => {
  await mockSignupApi(page, { authenticated: true });
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/feed$/);
  await expect(
    page.locator(".create-trigger").getByAltText("신규사용자 프로필"),
  ).toBeVisible();
});
