import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  defaultNormalizedCrop,
  frameAspect,
  normalizedCrop,
} from "../lib/imagePreview.js";

const MINIMUM_SIZE = {
  PROFILE: [320, 320],
  POST_PORTRAIT: [448, 600],
  POST_LANDSCAPE: [448, 288],
};

export function ImageEditor({
  source,
  purpose,
  width,
  height,
  initialFrame,
  disabled = false,
  onChange,
}) {
  const [frame, setFrame] = useState(initialFrame);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [cropArea, setCropArea] = useState(() =>
    defaultNormalizedCrop(width, height, frameAspect(initialFrame)),
  );

  const publish = useCallback(
    (nextFrame, nextRotation, nextCrop) => {
      onChange?.({
        purpose,
        frame: nextFrame,
        rotation: nextRotation,
        crop: nextCrop,
      });
    },
    [onChange, purpose],
  );

  useEffect(() => {
    setFrame(initialFrame);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    const next = defaultNormalizedCrop(
      width,
      height,
      frameAspect(initialFrame),
    );
    setCropArea(next);
    publish(initialFrame, 0, next);
  }, [height, initialFrame, publish, source, width]);

  const changeFrame = (nextFrame) => {
    setFrame(nextFrame);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    const next = defaultNormalizedCrop(
      width,
      height,
      frameAspect(nextFrame),
      rotation,
    );
    setCropArea(next);
    publish(nextFrame, rotation, next);
  };

  const rotate = () => {
    const nextRotation = (rotation + 90) % 360;
    setRotation(nextRotation);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    const next = defaultNormalizedCrop(
      width,
      height,
      frameAspect(frame),
      nextRotation,
    );
    setCropArea(next);
    publish(frame, nextRotation, next);
  };

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    const next = defaultNormalizedCrop(width, height, frameAspect(frame));
    setCropArea(next);
    publish(frame, 0, next);
  };

  const warning = useMemo(() => {
    if (!width || !height) return "이미지 해상도는 서버에서 최종 확인합니다.";
    const rotatedWidth = rotation % 180 === 0 ? width : height;
    const rotatedHeight = rotation % 180 === 0 ? height : width;
    const [minimumWidth, minimumHeight] = MINIMUM_SIZE[frame];
    if (
      cropArea.width * rotatedWidth < minimumWidth ||
      cropArea.height * rotatedHeight < minimumHeight
    ) {
      return `선택 영역이 ${minimumWidth}×${minimumHeight}px보다 작아 처리에 실패할 수 있습니다.`;
    }
    return "고해상도 원본을 유지한 채 서버에서 WebP로 변환합니다.";
  }, [cropArea, frame, height, rotation, width]);

  return (
    <section className="image-editor" aria-label="이미지 편집기">
      <div
        className="image-editor__viewport"
        tabIndex={0}
        onKeyDown={(event) => {
          if (disabled) return;
          const delta = event.shiftKey ? 10 : 2;
          if (event.key === "ArrowLeft")
            setCrop((value) => ({ ...value, x: value.x - delta }));
          else if (event.key === "ArrowRight")
            setCrop((value) => ({ ...value, x: value.x + delta }));
          else if (event.key === "ArrowUp")
            setCrop((value) => ({ ...value, y: value.y - delta }));
          else if (event.key === "ArrowDown")
            setCrop((value) => ({ ...value, y: value.y + delta }));
          else return;
          event.preventDefault();
        }}
      >
        <Cropper
          image={source}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={frameAspect(frame)}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(percentages) => {
            const next = normalizedCrop(percentages);
            setCropArea(next);
            publish(frame, rotation, next);
          }}
          minZoom={1}
          maxZoom={3}
          zoomSpeed={0.1}
          keyboardStep={2}
          restrictPosition
          showGrid
          style={{
            containerStyle: { pointerEvents: disabled ? "none" : "auto" },
          }}
        />
      </div>
      <div className="image-editor__controls">
        {purpose === "POST" && (
          <span
            className="image-editor__frames"
            aria-label="게시글 이미지 비율"
          >
            <button
              type="button"
              aria-pressed={frame === "POST_PORTRAIT"}
              onClick={() => changeFrame("POST_PORTRAIT")}
              disabled={disabled}
            >
              세로
            </button>
            <button
              type="button"
              aria-pressed={frame === "POST_LANDSCAPE"}
              onClick={() => changeFrame("POST_LANDSCAPE")}
              disabled={disabled}
            >
              가로
            </button>
          </span>
        )}
        <label>
          <span>배율 {zoom.toFixed(1)}×</span>
          <input
            aria-label="이미지 배율"
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            disabled={disabled}
          />
        </label>
        <button type="button" onClick={rotate} disabled={disabled}>
          90° 회전
        </button>
        <button type="button" onClick={reset} disabled={disabled}>
          초기화
        </button>
      </div>
      <p className="image-editor__quality">{warning}</p>
    </section>
  );
}
