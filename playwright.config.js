import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "ko-KR",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run serve:test",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: true,
  },
});
