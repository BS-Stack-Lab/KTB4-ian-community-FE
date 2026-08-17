import { describe, expect, it } from "vitest";
import { imageCropQuality } from "../../src/features/media/lib/imageQuality.js";

describe("피드 Crop 품질 등급", () => {
  it("3X 충족, 1X만 충족, 1X 미만을 구분한다", () => {
    expect(
      imageCropQuality({
        width: 1600,
        height: 1000,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        frame: "POST_LANDSCAPE",
      }).level,
    ).toBe("GOOD");
    expect(
      imageCropQuality({
        width: 900,
        height: 600,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        frame: "POST_LANDSCAPE",
      }).level,
    ).toBe("STANDARD_ONLY");
    expect(
      imageCropQuality({
        width: 320,
        height: 200,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        frame: "POST_LANDSCAPE",
      }).level,
    ).toBe("LOW");
  });
});
