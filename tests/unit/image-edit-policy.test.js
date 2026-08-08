import { describe, expect, it } from "vitest";
import {
  defaultNormalizedCrop,
  initialPostFrame,
  normalizedCrop,
} from "../../src/features/media/lib/imagePreview.js";

describe("이미지 편집 정책", () => {
  it("보정된 비율 1.08 이하는 세로, 초과는 가로로 시작한다", () => {
    expect(initialPostFrame(1080, 1000)).toBe("POST_PORTRAIT");
    expect(initialPostFrame(1081, 1000)).toBe("POST_LANDSCAPE");
  });

  it("Crop percentage를 0~1 좌표로 제한한다", () => {
    expect(normalizedCrop({ x: 12.5, y: 25, width: 50, height: 60 })).toEqual({
      x: 0.125,
      y: 0.25,
      width: 0.5,
      height: 0.6,
    });
    expect(normalizedCrop({ x: 90, y: 90, width: 40, height: 40 })).toEqual({
      x: 0.6,
      y: 0.6,
      width: 0.4,
      height: 0.4,
    });
  });

  it("회전 뒤 원본 크기를 기준으로 중앙 Crop을 계산한다", () => {
    const crop = defaultNormalizedCrop(1200, 800, 1, 90);
    expect(crop.x).toBe(0);
    expect(crop.width).toBe(1);
    expect(crop.y).toBeCloseTo(1 / 6);
    expect(crop.height).toBeCloseTo(2 / 3);
  });
});
