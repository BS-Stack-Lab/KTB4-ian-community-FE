import { fireEvent } from "@testing-library/dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedImageEditModal } from "../../src/features/media/ui/FeedImageEditModal.jsx";

vi.mock("react-easy-crop", async () => {
  const { createElement: createMockElement } = await import("react");
  return {
    default: ({ onCropComplete }) =>
      createMockElement(
        "button",
        {
          type: "button",
          "aria-label": "Crop 완료 시뮬레이션",
          onClick: () =>
            onCropComplete(
              { x: 12.5, y: 25, width: 50, height: 60 },
              { x: 200, y: 225, width: 800, height: 540 },
            ),
        },
        "Crop 완료 시뮬레이션",
      ),
  };
});

describe("FeedImageEdit Figma Modal", () => {
  let root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.querySelector("#root"));
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(async () => {
    await act(() => root.unmount());
  });

  async function render(
    initialEdit,
    onAttach = vi.fn(),
    frame = "POST_LANDSCAPE",
  ) {
    await act(() =>
      root.render(
        createElement(FeedImageEditModal, {
          open: true,
          source: "data:image/png;base64,AA==",
          width: 1600,
          height: 900,
          frame,
          initialEdit,
          onCancel: vi.fn(),
          onAttach,
        }),
      ),
    );
    return onAttach;
  }

  it("신규 이미지 Slider는 1~3 범위의 가장 왼쪽에서 시작한다", async () => {
    await render();
    const slider = document.querySelector('[aria-label="이미지 확대 배율"]');
    expect(slider.min).toBe("1");
    expect(slider.max).toBe("3");
    expect(slider.step).toBe("0.01");
    expect(slider.value).toBe("1");
    expect(
      document.querySelectorAll(".feed-image-edit-slider__ticks img"),
    ).toHaveLength(5);
    expect(document.body.textContent).not.toContain("회전");
  });

  it("기존 zoom을 복원하고 Refresh는 zoom 1로 초기화한다", async () => {
    await render({
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      zoom: 2.25,
    });
    const slider = document.querySelector('[aria-label="이미지 확대 배율"]');
    expect(slider.value).toBe("2.25");
    await act(() =>
      fireEvent.click(
        document.querySelector('[aria-label="이미지 편집 초기화"]'),
      ),
    );
    expect(slider.value).toBe("1");
  });

  it("첨부 시 Crop·zoom·position과 회전 0을 전달한다", async () => {
    const onAttach = await render();
    await act(() =>
      fireEvent.change(
        document.querySelector('[aria-label="이미지 확대 배율"]'),
        { target: { value: "1.5" } },
      ),
    );
    await act(() =>
      fireEvent.click(document.querySelector('[aria-label="이미지 첨부"]')),
    );
    expect(onAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "POST",
        frame: "POST_LANDSCAPE",
        rotation: 0,
        zoom: 1.5,
        position: expect.objectContaining({ x: expect.any(Number) }),
      }),
    );
  });

  it("Cropper의 픽셀값이 아닌 percentage를 첨부 좌표로 사용한다", async () => {
    const onAttach = await render(undefined, vi.fn(), "POST_PORTRAIT");

    await act(() =>
      fireEvent.click(
        document.querySelector('[aria-label="Crop 완료 시뮬레이션"]'),
      ),
    );
    await act(() =>
      fireEvent.click(document.querySelector('[aria-label="이미지 첨부"]')),
    );

    expect(onAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        crop: { x: 0.125, y: 0.25, width: 0.5, height: 0.6 },
        position: { x: 0.375, y: 0.55 },
      }),
    );
  });
});
