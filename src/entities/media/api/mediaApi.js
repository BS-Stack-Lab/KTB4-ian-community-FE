import { ApiError } from "../../../shared/api/apiError.js";
import { httpClient } from "../../../shared/api/httpClient.js";
import { beginTrackedMutation } from "../../../shared/update/reloadSafety.js";

const json = (value) => JSON.stringify(value);

async function uploadToPresignedPost(file, upload, signal) {
  const body = new FormData();
  Object.entries(upload.fields || {}).forEach(([name, value]) => {
    body.append(name, value);
  });
  body.append("file", file);

  let response;
  const releaseMutation = beginTrackedMutation();
  try {
    response = await fetch(upload.url, { method: "POST", body, signal });
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw new ApiError("이미지 원본 업로드에 실패했습니다.", { cause });
  } finally {
    releaseMutation();
  }
  if (!response.ok) {
    throw new ApiError("이미지 원본 업로드에 실패했습니다.", {
      status: response.status,
      response,
    });
  }
}

export const mediaApi = {
  initiate: (payload, options) =>
    httpClient("/api/v2/media/uploads", {
      ...options,
      method: "POST",
      body: json(payload),
    }),
  uploadToPresignedPost,
  complete: (mediaId, options) =>
    httpClient(`/api/v2/media/${mediaId}/complete`, {
      ...options,
      method: "POST",
    }),
  get: (mediaId, options) => httpClient(`/api/v2/media/${mediaId}`, options),
  editSource: (mediaId, options) =>
    httpClient(`/api/v2/media/${mediaId}/edit-source`, {
      ...options,
      method: "POST",
    }),
  createRevision: (mediaId, payload, options) =>
    httpClient(`/api/v2/media/${mediaId}/revisions`, {
      ...options,
      method: "POST",
      body: json(payload),
    }),
  getRevision: (mediaId, revision, options) =>
    httpClient(`/api/v2/media/${mediaId}/revisions/${revision}`, options),
  cancelRevision: (mediaId, revision, options) =>
    httpClient(`/api/v2/media/${mediaId}/revisions/${revision}`, {
      ...options,
      method: "DELETE",
    }),
  cancel: (mediaId, options) =>
    httpClient(`/api/v2/media/${mediaId}`, {
      ...options,
      method: "DELETE",
    }),
};
