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

  const url = URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    return {
      // Keep the browser preview pointed at the upload bytes. The bitmap is decoded
      // only to inspect the EXIF-oriented dimensions; no resize or re-encoding occurs.
      url,
      width: bitmap.width,
      height: bitmap.height,
      revoke() {},
    };
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw cause;
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
