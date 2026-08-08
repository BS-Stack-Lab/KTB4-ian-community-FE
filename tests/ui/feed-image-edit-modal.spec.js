import { expect, test } from "@playwright/test";

const user = {
  userId: 7,
  email: "pulse@example.com",
  nickname: "dlkfjs",
  profileImage: "/images/profile-default.svg",
};

async function prepare(page) {
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
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/api/csrf") {
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          "Set-Cookie": "XSRF-TOKEN=feed-image-edit; Path=/; SameSite=Lax",
        },
      });
    }
    if (url.pathname === "/api/users/me") {
      return route.fulfill({ json: { data: user }, headers: cors });
    }
    if (url.pathname === "/api/v2/posts") {
      return route.fulfill({
        json: { data: { content: [], hasNext: false } },
        headers: cors,
      });
    }
    if (url.pathname === "/api/v2/media/uploads") {
      return route.fulfill({
        json: {
          data: {
            mediaId: "media-new",
            status: "PENDING_UPLOAD",
            upload: {
              url: "http://127.0.0.1:8080/test-media-upload",
              fields: { key: "private/uploads/media-new/source" },
            },
          },
        },
        headers: cors,
      });
    }
    if (url.pathname === "/test-media-upload") {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/api/v2/media/media-new/complete") {
      return route.fulfill({
        json: {
          data: {
            mediaId: "media-new",
            status: "READY",
            frame: "POST_LANDSCAPE",
            mediaRevision: 1,
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
    if (url.pathname === "/images/profile-default.svg") {
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#eee"/></svg>',
        headers: cors,
      });
    }
    if (url.pathname === "/images/feed/edit-fixture.jpg") {
      return route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        path: "tests/fixtures/feed-create-reference.jpg",
        headers: cors,
      });
    }
    return route.fulfill({ status: 204, headers: cors });
  });
}

async function openImageEditor(page) {
  await page.goto("/feed");
  await expect(page.getByTestId("feed-content")).toHaveClass(/is-visible/);
  await page.getByRole("button", { name: "피드 게시하기" }).click();
  await page
    .locator('.feed-create-modal input[type="file"]')
    .setInputFiles("tests/fixtures/feed-create-reference.jpg");
  const dialog = page.getByRole("dialog", { name: "이미지 편집" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("이미지 확대 배율")).toHaveValue("1");
  return dialog;
}

test("FeedImageEdit는 최신 Figma 480×486 및 Slider 토큰을 사용한다", async ({
  page,
}) => {
  await prepare(page);
  const dialog = await openImageEditor(page);

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
    const style = (selector) =>
      getComputedStyle(document.querySelector(selector));
    return {
      dialog: rect(".feed-image-edit-modal"),
      header: rect(".feed-image-edit-modal__header"),
      body: rect(".feed-image-edit-modal__body"),
      viewport: rect(".feed-image-edit-modal__viewport"),
      slider: rect(".feed-image-edit-slider"),
      track: rect(".feed-image-edit-slider__track"),
      footer: rect(".feed-image-edit-modal__footer"),
      reset: rect(".feed-image-edit-modal__reset"),
      attach: rect(".feed-image-edit-modal__attach"),
      media: rect(".feed-image-edit-modal__viewport .reactEasyCrop_Image"),
      dialogRadius: style(".feed-image-edit-modal").borderRadius,
      trackColor: style(".feed-image-edit-slider__track").backgroundColor,
      fillColor: style(".feed-image-edit-slider__track > span").backgroundColor,
      backdrop: style(".modal").backgroundColor,
    };
  });

  expect(metrics.dialog).toEqual({ x: 720, y: 297, width: 480, height: 486 });
  expect(metrics.header.height).toBe(52);
  expect(metrics.body.height).toBe(378);
  expect(metrics.viewport).toMatchObject({ width: 448, height: 288 });
  expect(metrics.slider).toMatchObject({ width: 448, height: 50 });
  expect(metrics.track).toMatchObject({ width: 448, height: 6 });
  expect(metrics.track.y - metrics.slider.y).toBe(22);
  expect(metrics.footer.height).toBe(56);
  expect(metrics.reset).toMatchObject({ x: 736, width: 32, height: 32 });
  expect(metrics.attach).toMatchObject({ x: 1130, width: 32, height: 32 });
  expect(metrics.dialogRadius).toBe("30px");
  expect(metrics.trackColor).toBe("rgba(120, 120, 120, 0.2)");
  expect(metrics.fillColor).toBe("rgb(91, 92, 235)");
  expect(metrics.backdrop).toBe("rgba(0, 0, 0, 0.4)");
  expect(metrics.media.height).toBeGreaterThanOrEqual(
    metrics.viewport.height - 0.1,
  );
  await expect(
    dialog.locator(".feed-image-edit-slider__ticks img"),
  ).toHaveCount(5);
  await expect(dialog.getByText(/회전/)).toHaveCount(0);

  await page.screenshot({
    path: "tests/visual/actual/feed-image-edit-modal-1920x1080.png",
    fullPage: true,
  });
});

test("FeedImageEdit 모바일은 32px 외부 여백과 448:288 비율을 유지한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  const dialog = await openImageEditor(page);
  const layout = await page.evaluate(() => {
    const modal = document
      .querySelector(".feed-image-edit-modal")
      .getBoundingClientRect();
    const viewport = document
      .querySelector(".feed-image-edit-modal__viewport")
      .getBoundingClientRect();
    const slider = document
      .querySelector(".feed-image-edit-slider")
      .getBoundingClientRect();
    return {
      modal: { left: modal.left, right: modal.right, width: modal.width },
      viewportRatio: viewport.width / viewport.height,
      sliderWidth: slider.width,
      viewportWidth: viewport.width,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.modal).toEqual({ left: 16, right: 374, width: 358 });
  expect(layout.viewportRatio).toBeCloseTo(448 / 288, 2);
  expect(layout.sliderWidth).toBe(layout.viewportWidth);
  expect(layout.documentWidth).toBeLessThanOrEqual(390);
  await expect(dialog.getByLabel("이미지 확대 배율")).toHaveValue("1");
  await page.screenshot({
    path: "tests/visual/actual/feed-image-edit-modal-390x844.png",
    fullPage: true,
  });
});
