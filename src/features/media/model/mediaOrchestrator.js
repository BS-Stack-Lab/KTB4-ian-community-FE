import { ApiError } from "../../../shared/api/apiError.js";
import { mediaApi } from "../../../entities/media/api/mediaApi.js";

const READY = "READY";
const FAILED = "FAILED";

export async function pollMedia(
  mediaId,
  {
    signal,
    timeoutMs = 60_000,
    initialDelayMs = 500,
    maximumDelayMs = 5_000,
    now = () => Date.now(),
    sleep = (delay) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason || new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    get = mediaApi.get,
  } = {},
) {
  const startedAt = now();
  let delay = initialDelayMs;
  while (now() - startedAt < timeoutMs) {
    await sleep(delay);
    const media = await get(mediaId, { signal });
    if (media.status === READY) return media;
    if (media.status === FAILED) {
      throw new ApiError("이미지 처리에 실패했습니다.", {
        code: media.errorCode || "MEDIA_PROCESSING_FAILED",
      });
    }
    delay = Math.min(delay * 2, maximumDelayMs);
  }
  throw new ApiError("이미지 처리 시간이 초과되었습니다. 다시 시도해주세요.", {
    code: "MEDIA_PROCESSING_TIMEOUT",
  });
}

export async function pollRevision(
  mediaId,
  revision,
  {
    signal,
    timeoutMs = 60_000,
    initialDelayMs = 500,
    maximumDelayMs = 5_000,
    now = () => Date.now(),
    sleep = (delay) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason || new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    get = mediaApi.getRevision,
  } = {},
) {
  const startedAt = now();
  let delay = initialDelayMs;
  while (now() - startedAt < timeoutMs) {
    await sleep(delay);
    const mediaRevision = await get(mediaId, revision, { signal });
    if (mediaRevision.status === READY) return mediaRevision;
    if (mediaRevision.status === FAILED) {
      throw new ApiError("이미지 편집 처리에 실패했습니다.", {
        code: mediaRevision.errorCode || "MEDIA_REVISION_PROCESSING_FAILED",
      });
    }
    delay = Math.min(delay * 2, maximumDelayMs);
  }
  throw new ApiError(
    "이미지 편집 처리 시간이 초과되었습니다. 다시 시도해주세요.",
    { code: "MEDIA_REVISION_PROCESSING_TIMEOUT" },
  );
}

export async function uploadMedia(file, edit, { signal } = {}) {
  let mediaId = null;
  try {
    const initiated = await mediaApi.initiate(
      {
        purpose: edit.purpose,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        frame: edit.frame,
        rotation: edit.rotation,
        crop: edit.crop,
        zoom: edit.zoom ?? 1,
        position: edit.position ?? {
          x: edit.crop.x + edit.crop.width / 2,
          y: edit.crop.y + edit.crop.height / 2,
        },
      },
      { signal },
    );
    mediaId = initiated.mediaId;
    await mediaApi.uploadToPresignedPost(file, initiated.upload, signal);
    const completed = await mediaApi.complete(mediaId, { signal });
    if (completed.status === READY) return completed;
    if (completed.status === FAILED) {
      throw new ApiError("이미지 처리에 실패했습니다.", {
        code: completed.errorCode || "MEDIA_PROCESSING_FAILED",
      });
    }
    return await pollMedia(mediaId, { signal });
  } catch (cause) {
    cause.mediaId = mediaId;
    throw cause;
  }
}

export async function prepareRevision(mediaId, edit, { signal } = {}) {
  let revision = null;
  try {
    const created = await mediaApi.createRevision(
      mediaId,
      {
        frame: edit.frame,
        crop: edit.crop,
        zoom: edit.zoom,
        position: edit.position,
      },
      { signal },
    );
    revision = created.revision;
    if (created.status === READY) return created;
    if (created.status === FAILED) {
      throw new ApiError("이미지 편집 처리에 실패했습니다.", {
        code: created.errorCode || "MEDIA_REVISION_PROCESSING_FAILED",
      });
    }
    return await pollRevision(mediaId, revision, { signal });
  } catch (cause) {
    cause.mediaId = mediaId;
    cause.revision = revision;
    throw cause;
  }
}
