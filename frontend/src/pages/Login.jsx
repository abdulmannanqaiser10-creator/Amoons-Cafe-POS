import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LexcoreLogo from "../components/LexcoreLogo";
import LexcoreCredit from "../components/LexcoreCredit";
import { api, errorMessage } from "../api/client";
import { useMenu } from "../components/MenuProvider";

const PIN_LENGTH = 5;
const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function BackspaceIcon() {
  return (
    <svg
      className="key-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6H9.6a2 2 0 0 0-1.5.7l-4 4.6a1.2 1.2 0 0 0 0 1.4l4 4.6a2 2 0 0 0 1.5.7H20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z" />
      <path d="m13.5 9.5-4 5M9.5 9.5l4 5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="pin-message-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.14" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.4v5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="16.3" r="1.1" fill="currentColor" />
    </svg>
  );
}

function RevealIcon({ off }) {
  return (
    <svg
      className="pin-reveal-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function BrandPanel() {
  return (
    <aside className="brand-panel brand-panel--coffee" aria-label="Lexcore Solutions">
      <img
        className="brand-coffee-photo"
        src="/login-coffee.jpg"
        alt=""
        decoding="async"
      />
      <div className="brand-coffee-veil" aria-hidden="true" />
      <div className="brand-head brand-head--lexcore">
        <LexcoreLogo light />
      </div>
      <div className="brand-art brand-art--coffee">
        <p className="brand-coffee-quote brand-coffee-amoons">Amoons</p>
        <p className="brand-coffee-tag">Crafted for modern hospitality.</p>
      </div>
    </aside>
  );
}

function Login() {
  const navigate = useNavigate();
  const { reload } = useMenu();
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const submitting = useRef(false);

  const verify = useCallback(
    async (value) => {
      if (submitting.current) return;
      submitting.current = true;
      setVerifying(true);
      setError("");

      try {
        const { data } = await api.post("/auth/login", { pin: value });
        localStorage.setItem("token", data.token);
        await reload();
        navigate(data.role === "admin" ? "/admin" : "/home", { replace: true });
      } catch (problem) {
        setError(errorMessage(problem, "Incorrect PIN. Try again."));
        setPin("");
      } finally {
        submitting.current = false;
        setVerifying(false);
      }
    },
    [navigate, reload]
  );

  useEffect(() => {
    if (pin.length === PIN_LENGTH) verify(pin);
  }, [pin, verify]);

  useEffect(() => {
    const onKey = (event) => {
      if (verifying) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        setPin((current) => (current.length < PIN_LENGTH ? current + event.key : current));
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setPin((current) => current.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [verifying]);

  const addDigit = (digit) => {
    if (verifying) return;
    setPin((current) => (current.length < PIN_LENGTH ? current + digit : current));
  };

  const removeDigit = () => {
    if (verifying) return;
    setPin((current) => current.slice(0, -1));
  };

  const activeIndex = pin.length < PIN_LENGTH ? pin.length : -1;

  return (
    <main className="login-page login-page--coffee relative min-h-screen w-full overflow-hidden">
      <div className="login-coffee-bg" aria-hidden="true">
        <img src="/login-coffee.jpg" alt="" />
        <span className="login-coffee-shade" />
      </div>

      <div className="login-stage">
        <div className="login-shell login-shell--modern">
          <BrandPanel />

          <section className="login-panel" aria-label="Lexcore Solutions login" aria-busy={verifying}>
            <div className="login-body">
              <p className="sr-only">
                Enter your 5-digit PIN using the keypad or your keyboard number keys.
              </p>

              <header className="login-header text-center">
                <div className="login-lexcore-badge">
                  <LexcoreLogo compact />
                </div>

                <h1 className="login-title login-title--welcome">
                  <span className="login-title-line">Hey Amoons,</span>
                  <span className="login-title-line">
                    Welcome to <span className="login-accent">Lexcore Solutions</span>
                  </span>
                </h1>

                <p className="login-subtitle">
                  <span className="login-subtitle-line" aria-hidden="true" />
                  Enter your 5-digit PIN
                  <span className="login-subtitle-line" aria-hidden="true" />
                </p>
              </header>

              <div
                className="pin-row"
                role="group"
                aria-label={`PIN entry, ${pin.length} of ${PIN_LENGTH} digits entered`}
              >
                {Array.from({ length: PIN_LENGTH }).map((_, index) => {
                  const filled = index < pin.length;
                  const active = index === activeIndex && !verifying;

                  return (
                    <div
                      key={index}
                      className={[
                        "pin-box",
                        filled ? "pin-box--filled" : "",
                        active ? "pin-box--active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {filled ? (
                        showPin ? (
                          <span className="pin-digit">{pin[index]}</span>
                        ) : (
                          <span className="pin-dot" />
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="pin-tools">
                <button
                  type="button"
                  className={`pin-reveal${showPin ? " pin-reveal--on" : ""}`}
                  aria-pressed={showPin}
                  onClick={() => setShowPin((current) => !current)}
                  disabled={verifying}
                >
                  <RevealIcon off={showPin} />
                  {showPin ? "Hide PIN" : "Show PIN"}
                </button>
              </div>

              <p
                className={`pin-message${error ? " pin-message--visible" : ""}`}
                role="alert"
                aria-live="polite"
              >
                {error && <AlertIcon />}
                <span className="pin-message-text">{error}</span>
              </p>

              <div className={`keypad${verifying ? " keypad--busy" : ""}`}>
                {KEYPAD_DIGITS.map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    className="key"
                    onClick={() => addDigit(digit)}
                    disabled={verifying}
                    aria-label={digit}
                  >
                    {digit}
                  </button>
                ))}

                <button
                  type="button"
                  className="key key--zero"
                  onClick={() => addDigit("0")}
                  disabled={verifying}
                  aria-label="0"
                >
                  0
                </button>

                <button
                  type="button"
                  className="key key--action"
                  onClick={removeDigit}
                  disabled={verifying}
                  aria-label="Backspace"
                >
                  <BackspaceIcon />
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="login-lexcore">
          <LexcoreCredit compact />
        </div>
      </div>
    </main>
  );
}

export default Login;
