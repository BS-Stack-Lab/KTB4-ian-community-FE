import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5502";
const externalServer = ["1", "true"].includes(
  (process.env.E2E_EXTERNAL_SERVER ?? "").toLowerCase(),
);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "ko-KR",
    trace: "retain-on-failure",
  },
  webServer: externalServer
    ? undefined
    : {
        command: "npm run serve:test -- --port 5502",
        url: `${baseURL}/`,
        reuseExistingServer: true,
      },
});
