function objectUrlPreview(file) {
  return {
    url: URL.createObjectURL(file),
    width: null,
    height: null,
    revoke() {},
  };
}

export async function createOrientedPreview(file) {
  if (typeof createImageBitmap !== "function") return objectUrlPreview(file);

  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context || typeof canvas.toBlob !== "function") {
      return objectUrlPreview(file);
    }
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("미리보기를 만들 수 없습니다.")),
        "image/webp",
        0.9,
      );
    });
    return {
      url: URL.createObjectURL(blob),
      width: bitmap.width,
      height: bitmap.height,
      revoke() {},
    };
  } finally {
    bitmap.close();
  }
}

export function initialPostFrame(width, height) {
  if (!width || !height) return "POST_LANDSCAPE";
  return width / height <= 1.08 ? "POST_PORTRAIT" : "POST_LANDSCAPE";
}

export function frameAspect(frame) {
  if (frame === "PROFILE") return 1;
  if (frame === "POST_PORTRAIT") return 56 / 75;
  return 14 / 9;
}

export function normalizedCrop(percentages = {}) {
  const clamp = (value, minimum, maximum) =>
    Math.min(Math.max(Number(value) || 0, minimum), maximum);
  const width = clamp(percentages.width / 100, 0.000001, 1);
  const height = clamp(percentages.height / 100, 0.000001, 1);
  return {
    x: clamp(percentages.x / 100, 0, 1 - width),
    y: clamp(percentages.y / 100, 0, 1 - height),
    width,
    height,
  };
}

export function defaultNormalizedCrop(width, height, aspect, rotation = 0) {
  if (!width || !height) return { x: 0, y: 0, width: 1, height: 1 };
  const rotated =
    rotation % 180 === 0 ? { width, height } : { width: height, height: width };
  const sourceAspect = rotated.width / rotated.height;
  if (sourceAspect > aspect) {
    const cropWidth = aspect / sourceAspect;
    return { x: (1 - cropWidth) / 2, y: 0, width: cropWidth, height: 1 };
  }
  const cropHeight = sourceAspect / aspect;
  return { x: 0, y: (1 - cropHeight) / 2, width: 1, height: cropHeight };
}
