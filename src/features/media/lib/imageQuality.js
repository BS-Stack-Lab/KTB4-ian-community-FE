const TARGETS = {
  POST_LANDSCAPE: {
    oneX: { width: 448, height: 288 },
    threeX: { width: 1344, height: 864 },
  },
  POST_PORTRAIT: {
    oneX: { width: 448, height: 600 },
    threeX: { width: 1344, height: 1800 },
  },
};

export const QUALITY_MESSAGES = {
  STANDARD_ONLY: "확대하면 고해상도 화면에서 이미지가 흐리게 보일 수 있어요.",
  LOW: "선택한 영역의 해상도가 낮아 게시 이미지가 흐리게 보일 수 있어요.",
};

export function imageCropQuality({ width, height, crop, frame }) {
  const target = TARGETS[frame];
  if (!target || !width || !height || !crop) {
    return { level: "GOOD", ratio1X: 1, ratio3X: 1 };
  }
  const cropWidth = Math.floor(Number(width) * crop.width);
  const cropHeight = Math.floor(Number(height) * crop.height);
  const ratio1X = Math.min(
    cropWidth / target.oneX.width,
    cropHeight / target.oneX.height,
  );
  const ratio3X = Math.min(
    cropWidth / target.threeX.width,
    cropHeight / target.threeX.height,
  );
  return {
    level: ratio1X < 1 ? "LOW" : ratio3X < 1 ? "STANDARD_ONLY" : "GOOD",
    ratio1X,
    ratio3X,
  };
}
