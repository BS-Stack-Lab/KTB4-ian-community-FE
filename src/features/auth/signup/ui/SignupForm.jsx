import { useRef, useState } from "react";
import { userApi } from "../../../../entities/user/api/userApi.js";
import { signupLogoImage } from "../../../../shared/assets/index.js";
import { Button } from "../../../../shared/ui/Button.jsx";
import { useReloadBlocker } from "../../../../shared/update/useReloadBlocker.js";
import {
  isSignupValid,
  signupPayload,
  validateSignup,
} from "../model/validateSignup.js";

const INITIAL_VALUES = {
  email: "",
  password: "",
  passwordConfirm: "",
  nickname: "",
};

function serverErrors(error) {
  const fields = error.fieldErrors ?? {};
  const normalized = {
    ...fields,
    passwordConfirm: fields.passwordConfirm ?? fields.password_confirm,
  };
  const code = error.code ?? error.message;
  if (code === "EMAIL_ALREADY_EXISTS" || code === "email_already_exists")
    normalized.email = "이미 사용 중인 이메일입니다.";
  if (code === "NICKNAME_ALREADY_EXISTS" || code === "nickname_already_exists")
    normalized.nickname = "이미 사용 중인 닉네임입니다.";
  if (!normalized.email && !normalized.nickname && !error.fieldErrors)
    normalized.form =
      code === "INVALID_SIGNUP_REQUEST" || code === "invalid_signup_request"
        ? "입력한 회원가입 정보를 다시 확인해주세요."
        : error.message;
  return normalized;
}

export function SignupForm({ onAuthenticated, onLogin }) {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const valid = isSignupValid(values);
  useReloadBlocker(
    "signup-form",
    pending || Object.values(values).some((value) => Boolean(value)),
  );

  function change(field) {
    return (event) => {
      const value = event.target.value;
      setValues((current) => ({ ...current, [field]: value }));
      setErrors((current) => ({ ...current, [field]: "", form: "" }));
    };
  }

  function blur(field) {
    return () => {
      const next = validateSignup(values);
      setErrors((current) => ({ ...current, [field]: next[field] ?? "" }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (pendingRef.current) return;
    const nextErrors = validateSignup(values);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setErrors({});
    try {
      const result = await userApi.signup(signupPayload(values));
      const userId = result?.userId ?? result?.user_id;
      const currentUser = await userApi.me(userId);
      onAuthenticated({
        ...currentUser,
        userId,
        email: currentUser?.email ?? values.email.trim(),
        nickname: currentUser?.nickname ?? values.nickname.trim(),
      });
    } catch (error) {
      setErrors(serverErrors(error));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const fields = [
    {
      name: "email",
      label: "이메일",
      type: "email",
      autoComplete: "email",
      placeholder: "이메일을 입력하세요",
    },
    {
      name: "password",
      label: "비밀번호",
      type: "password",
      autoComplete: "new-password",
      placeholder: "비밀번호를 입력하세요",
    },
    {
      name: "passwordConfirm",
      label: "비밀번호 확인",
      type: "password",
      autoComplete: "new-password",
      placeholder: "비밀번호를 한번 더 입력하세요",
    },
    {
      name: "nickname",
      label: "닉네임",
      type: "text",
      autoComplete: "nickname",
      placeholder: "닉네임을 입력하세요",
    },
  ];

  return (
    <form
      className="signup-panel"
      onSubmit={submit}
      noValidate
      data-testid="signup-page-ready"
    >
      <img className="signup-panel__logo" src={signupLogoImage} alt="PULSE" />
      <div className="signup-panel__content">
        <div className="auth-divider" aria-label="회원가입">
          <span />
          <h1>회원가입</h1>
          <span />
        </div>
        <div className="signup-form__fields">
          {fields.map((field) => (
            <div className="signup-field" key={field.name}>
              <label className="sr-only" htmlFor={`signup-${field.name}`}>
                {field.label}
              </label>
              <input
                id={`signup-${field.name}`}
                aria-label={field.label}
                aria-invalid={Boolean(errors[field.name])}
                aria-describedby={
                  errors[field.name] ? `signup-${field.name}-error` : undefined
                }
                type={field.type}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                value={values[field.name]}
                onChange={change(field.name)}
                onBlur={blur(field.name)}
              />
              {errors[field.name] && (
                <p
                  className="signup-field__error"
                  id={`signup-${field.name}-error`}
                >
                  {errors[field.name]}
                </p>
              )}
            </div>
          ))}
          {errors.form && (
            <p className="signup-form__error" role="alert">
              {errors.form}
            </p>
          )}
          <Button
            className="signup-submit"
            type="submit"
            loading={pending}
            disabled={!valid}
          >
            {pending ? "가입 중" : "회원가입"}
          </Button>
        </div>
        <button className="auth-switch" type="button" onClick={onLogin}>
          로그인 하러가기
        </button>
      </div>
    </form>
  );
}
