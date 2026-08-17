import { httpClient } from "../../../shared/api/httpClient.js";

export const postApi = {
  list: ({ page = 0, size = 10, ...options } = {}) =>
    httpClient(`/api/v2/posts?page=${page}&size=${size}`, options),
  bookmarks: ({ page = 0, size = 10, ...options } = {}) =>
    httpClient(`/api/v2/posts/bookmarks?page=${page}&size=${size}`, options),
  detail: (postId, options) => httpClient(`/api/v2/posts/${postId}`, options),
  create: ({ content, image }) => {
    const body = new FormData();
    body.append("content", content);
    if (image) body.append("image", image);
    return httpClient("/api/posts/me", { method: "POST", body });
  },
  createV2: ({ content, mediaIds = [] }) =>
    httpClient("/api/v2/posts/me", {
      method: "POST",
      body: JSON.stringify({ content, mediaIds }),
    }),
  createAsyncMedia: ({ content, mediaIds = [] }) =>
    httpClient("/api/v2/posts/me/async-media", {
      method: "POST",
      body: JSON.stringify({ content, mediaIds }),
    }),
  update: (postId, { content, imageUrl }) =>
    httpClient(`/api/posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: content.slice(0, 26),
        content,
        imageUrl,
      }),
    }),
  updateV2: (postId, { content, mediaIds = [], revisionActivations = [] }) =>
    httpClient(`/api/v2/posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify({ content, mediaIds, revisionActivations }),
    }),
  updateAsyncMedia: (
    postId,
    { content, mediaIds = [], revisionTargets = [] },
  ) =>
    httpClient(`/api/v2/posts/${postId}/async-media`, {
      method: "PATCH",
      body: JSON.stringify({ content, mediaIds, revisionTargets }),
    }),
  remove: (postId) => httpClient(`/api/posts/${postId}`, { method: "DELETE" }),
  like: (postId) =>
    httpClient(`/api/posts/${postId}/likes`, { method: "POST" }),
  addBookmark: (postId) =>
    httpClient(`/api/posts/${postId}/bookmarks`, { method: "POST" }),
  deleteBookmark: (postId) =>
    httpClient(`/api/posts/${postId}/bookmarks`, { method: "DELETE" }),
  comment: (postId, comment) =>
    httpClient(`/api/posts/${postId}/comments/users/me`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }),
  updateComment: (postId, commentId, comment) =>
    httpClient(`/api/posts/${postId}/comments/${commentId}/users/me`, {
      method: "PATCH",
      body: JSON.stringify({ comment }),
    }),
  removeComment: (postId, commentId) =>
    httpClient(`/api/posts/${postId}/comments/${commentId}/users/me`, {
      method: "DELETE",
    }),
};
