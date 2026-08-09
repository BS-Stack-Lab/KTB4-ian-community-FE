import { useRef, useState } from "react";
import { userApi } from "../../../entities/user/api/userApi.js";
import { Button } from "../../../shared/ui/Button.jsx";
import { signupLogoImage } from "../../../shared/assets/index.js";
import { useReloadBlocker } from "../../../shared/update/useReloadBlocker.js";

export function LoginForm({ onAuthenticated, onSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  useReloadBlocker("login-form", Boolean(email || password || pending));

  async function submit(event) {
    event.preventDefault();
    if (pendingRef.current || !email.trim() || !password) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      const result = await userApi.login({ email: email.trim(), password });
      const userId = result?.userId ?? result?.user_id;
      const current = result?.nickname ? result : await userApi.me(userId);
      onAuthenticated({
        ...current,
        userId,
        email,
        nickname: current?.nickname ?? email.split("@")[0],
        profileImage: current?.profileImage ?? current?.profile_image,
      });
    } catch (cause) {
      setError(cause.message);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form
      className="auth-panel signup-panel login-panel"
      onSubmit={submit}
      data-testid="login-page-ready"
    >
      <img className="signup-panel__logo" src={signupLogoImage} alt="PULSE" />
      <div className="signup-panel__content">
        <div className="login-form__main">
          <div className="auth-divider">
            <span />
            <h1>로그인</h1>
            <span />
          </div>
          <div className="signup-form__fields">
            <label className="signup-field">
              <span className="sr-only">이메일</span>
              <input
                aria-label="이메일"
                type="email"
                placeholder="이메일 입력해주세요"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="signup-field">
              <span className="sr-only">비밀번호</span>
              <input
                aria-label="비밀번호"
                type="password"
                placeholder="비밀번호 입력해주세요"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && (
              <p className="signup-form__error" role="alert">
                {error}
              </p>
            )}
            <Button
              className="signup-submit"
              type="submit"
              loading={pending}
              disabled={!email.trim() || !password}
            >
              로그인
            </Button>
          </div>
        </div>
        <button className="auth-switch" type="button" onClick={onSignup}>
          회원가입 하러가기
        </button>
      </div>
    </form>
  );
}
