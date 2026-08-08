import { fireEvent, getByRole } from "@testing-library/dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageEditor } from "../../src/features/media/ui/ImageEditor.jsx";

describe("재사용 이미지 편집기", () => {
  let root;
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    container = document.querySelector("#root");
    root = createRoot(container);
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(async () => {
    await act(() => root.unmount());
  });

  it("프레임 변경·Zoom·90도 회전·Reset을 편집 값에 반영한다", async () => {
    const onChange = vi.fn();
    await act(() =>
      root.render(
        createElement(ImageEditor, {
          source: "data:image/png;base64,AA==",
          purpose: "POST",
          width: 1200,
          height: 800,
          initialFrame: "POST_LANDSCAPE",
          onChange,
        }),
      ),
    );

    await act(() =>
      fireEvent.click(getByRole(container, "button", { name: "세로" })),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ frame: "POST_PORTRAIT" }),
    );

    await act(() =>
      fireEvent.change(container.querySelector('[aria-label="이미지 배율"]'), {
        target: { value: "2" },
      }),
    );
    expect(container.textContent).toContain("배율 2.0×");

    await act(() =>
      fireEvent.click(getByRole(container, "button", { name: "90° 회전" })),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ rotation: 90 }),
    );

    await act(() =>
      fireEvent.click(getByRole(container, "button", { name: "초기화" })),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ rotation: 0 }),
    );
  });
});
