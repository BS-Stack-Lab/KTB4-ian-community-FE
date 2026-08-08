import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  directionTopIcon,
  feedImageEditRefreshArcIcon,
  feedImageEditRefreshCornerIcon,
  feedImageEditTickIcon,
} from "../../../shared/assets/index.js";
import { Modal } from "../../../shared/ui/Modal.jsx";
import {
  defaultNormalizedCrop,
  frameAspect,
  normalizedCrop,
} from "../lib/imagePreview.js";

const clampZoom = (value) => Math.min(Math.max(Number(value) || 1, 1), 3);

const cropPercentages = (crop) => ({
  x: crop.x * 100,
  y: crop.y * 100,
  width: crop.width * 100,
  height: crop.height * 100,
});

function cropCenter(crop) {
  return {
    x: Math.min(Math.max(crop.x + crop.width / 2, 0), 1),
    y: Math.min(Math.max(crop.y + crop.height / 2, 0), 1),
  };
}

export function FeedImageEditModal({
  open,
  source,
  width,
  height,
  frame = "POST_LANDSCAPE",
  initialEdit,
  pending = false,
  error = "",
  onCancel,
  onAttach,
}) {
  const defaultCrop = useMemo(
    () => defaultNormalizedCrop(width, height, frameAspect(frame)),
    [frame, height, width],
  );
  const minimumCropperZoom = useMemo(() => {
    if (frame !== "POST_LANDSCAPE" || !Number(width) || !Number(height)) {
      return 1;
    }
    const sourceAspect = Number(width) / Number(height);
    const targetAspect = frameAspect(frame);
    return Math.max(sourceAspect / targetAspect, targetAspect / sourceAspect);
  }, [frame, height, width]);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropArea, setCropArea] = useState(initialEdit?.crop || defaultCrop);
  const [zoom, setZoom] = useState(clampZoom(initialEdit?.zoom));
  const [cropperZoom, setCropperZoom] = useState(
    minimumCropperZoom * clampZoom(initialEdit?.zoom),
  );
  const [resetVersion, setResetVersion] = useState(0);
  const [cropSize, setCropSize] = useState(null);
  const viewportRef = useRef(null);
  const restoredCropPercentages = useMemo(
    () =>
      initialEdit?.position
        ? cropPercentages(initialEdit.crop || defaultCrop)
        : undefined,
    [defaultCrop, initialEdit],
  );

  const restore = useCallback(() => {
    const nextCrop = initialEdit?.crop || defaultCrop;
    setCropPosition({ x: 0, y: 0 });
    setCropArea(nextCrop);
    const restoredZoom = clampZoom(initialEdit?.zoom);
    setZoom(restoredZoom);
    setCropperZoom(minimumCropperZoom * restoredZoom);
    setResetVersion((value) => value + 1);
  }, [defaultCrop, initialEdit, minimumCropperZoom]);

  useEffect(() => {
    if (open) restore();
  }, [open, restore, source]);

  useLayoutEffect(() => {
    if (!open || frame !== "POST_LANDSCAPE" || !viewportRef.current) {
      setCropSize(null);
      return undefined;
    }
    const viewport = viewportRef.current;
    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCropSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [frame, open]);

  const reset = () => {
    setCropPosition({ x: 0, y: 0 });
    setCropArea(defaultCrop);
    setZoom(1);
    setCropperZoom(minimumCropperZoom);
    setResetVersion((value) => value + 1);
  };

  const progress = (zoom - 1) / 2;
  const sliderStyle = {
    "--feed-image-zoom-progress": progress,
  };

  return (
    <Modal
      open={open}
      title="이미지 편집"
      onClose={onCancel}
      className="feed-image-edit-modal"
    >
      <header className="feed-image-edit-modal__header">
        <div>
          <strong>이미지 편집</strong>
          <button type="button" onClick={onCancel}>
            취소
          </button>
        </div>
      </header>
      <section className="feed-image-edit-modal__body">
        <div
          ref={viewportRef}
          className="feed-image-edit-modal__viewport"
          aria-label="이미지 확대 및 위치 편집"
        >
          {source && (frame !== "POST_LANDSCAPE" || cropSize) && (
            <Cropper
              key={`${source}-${resetVersion}`}
              image={source}
              crop={cropPosition}
              zoom={cropperZoom}
              rotation={0}
              aspect={frameAspect(frame)}
              cropSize={cropSize || undefined}
              initialCroppedAreaPercentages={restoredCropPercentages}
              onCropChange={setCropPosition}
              onZoomChange={(value) => {
                setCropperZoom(value);
                setZoom(clampZoom(value / minimumCropperZoom));
              }}
              onCropComplete={(_, percentages) =>
                setCropArea(normalizedCrop(percentages))
              }
              minZoom={minimumCropperZoom}
              maxZoom={minimumCropperZoom * 3}
              zoomSpeed={0.01}
              keyboardStep={2}
              restrictPosition
              showGrid={false}
              zoomWithScroll
              style={{
                containerStyle: { pointerEvents: pending ? "none" : "auto" },
              }}
            />
          )}
        </div>
        <div className="feed-image-edit-slider" style={sliderStyle}>
          <span className="feed-image-edit-slider__track" aria-hidden="true">
            <span />
          </span>
          <span className="feed-image-edit-slider__ticks" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <img key={index} src={feedImageEditTickIcon} alt="" />
            ))}
          </span>
          <input
            aria-label="이미지 확대 배율"
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => {
              const next = clampZoom(event.target.value);
              setZoom(next);
              setCropperZoom(minimumCropperZoom * next);
            }}
            disabled={pending}
          />
        </div>
        {error && (
          <p className="feed-image-edit-modal__error" role="alert">
            {error}
          </p>
        )}
      </section>
      <footer className="feed-image-edit-modal__footer">
        <div>
          <button
            className="feed-image-edit-modal__reset"
            type="button"
            aria-label="이미지 편집 초기화"
            onClick={reset}
            disabled={pending}
          >
            <span aria-hidden="true">
              <img src={feedImageEditRefreshArcIcon} alt="" />
              <img src={feedImageEditRefreshCornerIcon} alt="" />
            </span>
          </button>
          <button
            className="feed-image-edit-modal__attach"
            type="button"
            aria-label={pending ? "이미지 처리 중" : "이미지 첨부"}
            onClick={() =>
              onAttach?.({
                purpose: "POST",
                frame,
                rotation: 0,
                crop: cropArea,
                zoom,
                position: cropCenter(cropArea),
              })
            }
            disabled={pending || !source}
          >
            <img src={directionTopIcon} alt="" />
          </button>
        </div>
      </footer>
    </Modal>
  );
}
