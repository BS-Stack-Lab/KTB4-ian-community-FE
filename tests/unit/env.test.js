import { describe, expect, it } from "vitest";
import { defaultApiBaseUrl } from "../../src/shared/config/env.js";

describe("API base URL", () => {
  it("로컬 개발 환경은 Backend 8080 Port를 사용한다", () => {
    expect(
      defaultApiBaseUrl({
        hostname: "127.0.0.1",
        origin: "http://127.0.0.1:5500",
      }),
    ).toBe("http://127.0.0.1:8080");
  });

  it("배포 환경은 HTTPS 동일 Origin을 사용한다", () => {
    expect(
      defaultApiBaseUrl({
        hostname: "community.example.com",
        origin: "https://community.example.com",
      }),
    ).toBe("https://community.example.com");
  });
});
