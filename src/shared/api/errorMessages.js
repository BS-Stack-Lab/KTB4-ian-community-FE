const ERROR_MESSAGES = {
  INVALID_LOGIN_REQUEST: "이메일 또는 비밀번호를 확인해주세요.",
  INVALID_PASSWORD: "비밀번호를 확인해주세요.",
  POST_NOT_FOUND: "게시글을 찾을 수 없습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  FORBIDDEN: "요청을 수행할 권한이 없습니다.",
  EXPIRED_ACCESS_TOKEN: "로그인 세션을 갱신하고 있습니다.",
  EXPIRED_REFRESH_TOKEN: "로그인 세션이 만료되었습니다.",
  REFRESH_TOKEN_NOT_FOUND: "로그인 세션이 없습니다.",
  INVALID_REFRESH_TOKEN: "로그인 세션이 유효하지 않습니다.",
  REFRESH_TOKEN_REUSED: "보안을 위해 다시 로그인해주세요.",
  INVALID_SIGNUP_REQUEST: "입력한 회원가입 정보를 다시 확인해주세요.",
  CURRENT_PASSWORD_MISMATCH: "현재 비밀번호가 일치하지 않습니다.",
  NEW_PASSWORD_MISMATCH: "새 비밀번호가 일치하지 않습니다.",
  PASSWORD_SAME_AS_CURRENT: "현재 비밀번호와 다른 비밀번호를 입력해주세요.",
  EMAIL_ALREADY_EXISTS: "이미 사용 중인 이메일입니다.",
  NICKNAME_ALREADY_EXISTS: "이미 사용 중인 닉네임입니다.",
  USER_NOT_FOUND: "사용자를 찾을 수 없습니다.",
  USER_ALREADY_DELETED: "탈퇴한 사용자입니다.",
  SELF_FOLLOW_NOT_ALLOWED: "본인은 팔로우할 수 없습니다.",
  BOOKMARK_OPERATION_FAILED: "북마크 처리에 실패했습니다.",
  INVALID_POST_REQUEST: "게시글 정보를 확인해주세요.",
  INVALID_COMMENT_REQUEST: "댓글 정보를 확인해주세요.",
  NO_CHANGES_DETECTED: "변경된 내용이 없습니다.",
  INTERNAL_SERVER_ERROR: "서버 오류가 발생했습니다.",
};

export const UNKNOWN_ERROR_MESSAGE =
  "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";

export function errorMessageFor(code, serverMessage) {
  if (code === "INVALID_REQUEST" && serverMessage) return serverMessage;
  return ERROR_MESSAGES[code] ?? UNKNOWN_ERROR_MESSAGE;
}
