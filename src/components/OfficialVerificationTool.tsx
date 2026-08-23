"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useEffect, useRef, useState } from "react";

type ChannelType =
  | "website"
  | "telegram"
  | "email"
  | "phone"
  | "linkedin"
  | "x";

type Result = "official" | "unofficial" | "unavailable" | "error" | null;

const channels: ChannelType[] = [
  "website",
  "telegram",
  "phone",
  "email",
  "linkedin",
  "x",
];

function ChannelIcon({ type, className = "" }: { type: ChannelType; className?: string }) {
  if (type === "website") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.5 12h17M12 3c2.2 2.45 3.3 5.45 3.3 9S14.2 18.55 12 21M12 3c-2.2 2.45-3.3 5.45-3.3 9S9.8 18.55 12 21" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (type === "telegram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="m20.2 4.4-3 14.1c-.22 1-1.05 1.24-1.9.77l-4.56-3.36-2.2 2.12c-.24.24-.45.45-.92.45l.33-4.64 8.45-7.64c.37-.33-.08-.51-.57-.18L5.39 12.6.9 11.2c-.98-.3-.99-.98.2-1.45L18.66 2.98c.81-.3 1.52.2 1.54 1.42Z" fill="currentColor" />
      </svg>
    );
  }
  if (type === "phone") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M7.1 3.5H4.8c-.72 0-1.3.58-1.3 1.3 0 8.67 7.03 15.7 15.7 15.7.72 0 1.3-.58 1.3-1.3v-2.3l-4.1-1.03-1.08 2.16a13.9 13.9 0 0 1-9.35-9.35L8.13 7.6 7.1 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "email") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M5.34 7.55A2.06 2.06 0 1 0 5.34 3.43a2.06 2.06 0 0 0 0 4.12ZM3.58 20.5H7.1V9.18H3.58V20.5ZM9.28 9.18h3.37v1.55h.05c.47-.89 1.62-1.83 3.33-1.83 3.56 0 4.22 2.34 4.22 5.39v6.21h-3.51V15c0-1.31-.03-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9v5.6H9.28V9.18Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 3.5 20 20.5M20 3.5 4 20.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function OfficialVerificationTool() {
  const t = useTranslations("verificationPage");
  const [type, setType] = useState<ChannelType>("website");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [checking, setChecking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const requestId = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const selectType = (nextType: ChannelType) => {
    requestId.current += 1;
    setType(nextType);
    setValue("");
    setResult(null);
    setChecking(false);
    setMenuOpen(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim() || checking) return;

    setMenuOpen(false);
    setChecking(true);
    setResult(null);
    const currentRequestId = ++requestId.current;

    try {
      const response = await fetch("/api/official-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value: value.trim() }),
      });

      if (currentRequestId !== requestId.current) return;

      if (!response.ok) {
        setResult("error");
        return;
      }

      const data = (await response.json()) as {
        available?: boolean;
        official?: boolean;
      };
      if (data.available === false) {
        setResult("unavailable");
      } else if (data.available === true && typeof data.official === "boolean") {
        setResult(data.official ? "official" : "unofficial");
      } else {
        setResult("error");
      }
    } catch {
      if (currentRequestId === requestId.current) setResult("error");
    } finally {
      if (currentRequestId === requestId.current) setChecking(false);
    }
  };

  return (
    <div>
      <form onSubmit={submit}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex min-h-[58px] flex-1 rounded-xl border border-[#deddd9] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition focus-within:border-[#aaa9a5]">
            <div ref={menuRef} className="relative w-[132px] shrink-0 sm:w-[160px]">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                onBlur={(event) => {
                  if (!menuRef.current?.contains(event.relatedTarget as Node)) {
                    setMenuOpen(false);
                  }
                }}
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                className="flex h-full w-full touch-manipulation items-center gap-2 border-r border-[#e6e5e2] px-3 text-left text-[13px] font-medium text-[#1a1a1a] sm:gap-2.5 sm:px-4"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[#1a1a1a]">
                  <ChannelIcon type={type} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 truncate">{t(`types.${type}`)}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className={`shrink-0 text-[#aaa] transition-transform ${menuOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  role="listbox"
                  aria-label={t("channelType")}
                  className="absolute left-0 top-[calc(100%+7px)] z-30 w-[220px] overflow-hidden rounded-xl border border-[#deddd9] bg-white p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.12)]"
                >
                  {channels.map((channel) => {
                    const active = channel === type;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        key={channel}
                        onClick={() => selectType(channel)}
                        onBlur={(event) => {
                          if (!menuRef.current?.contains(event.relatedTarget as Node)) {
                            setMenuOpen(false);
                          }
                        }}
                        className={`flex w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-3 text-left text-[13px] transition-colors ${
                          active
                            ? "bg-[#f0efed] font-medium text-[#1a1a1a]"
                            : "text-[#666] hover:bg-[#f7f6f4] hover:text-[#1a1a1a]"
                        }`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center">
                          <ChannelIcon type={channel} className="h-[18px] w-[18px]" />
                        </span>
                        {t(`types.${channel}`)}
                        {active && <span className="ml-auto text-[11px] text-[#1a1a1a]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="sr-only" htmlFor="verification-value">
              {t(`placeholders.${type}`)}
            </label>
            <input
              id="verification-value"
              value={value}
              onFocus={() => setMenuOpen(false)}
              onChange={(event) => {
                requestId.current += 1;
                setValue(event.target.value);
                setResult(null);
                setChecking(false);
              }}
              maxLength={320}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              inputMode={type === "email" ? "email" : type === "phone" ? "tel" : "url"}
              placeholder={t(`placeholders.${type}`)}
              className="min-w-0 flex-1 bg-transparent px-4 text-base text-[#1a1a1a] outline-none placeholder:text-[#b5b4b1] sm:text-[13px]"
            />
          </div>

          <button
            type="submit"
            disabled={!value.trim() || checking}
            className="min-h-[58px] min-w-[118px] touch-manipulation rounded-xl bg-[#1a1a1a] px-8 text-[14px] font-semibold text-white transition hover:bg-[#333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {checking ? t("checking") : t("check")}
          </button>
        </div>
      </form>

      {result && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-4 rounded-xl border px-4 py-4 sm:px-5 ${
            result === "official"
              ? "border-[#b8d5c1] bg-[#edf6f0]"
              : result === "unofficial"
                ? "border-[#e3c8b6] bg-[#fbf2ec]"
                : "border-[#deddd9] bg-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                result === "official"
                  ? "bg-[#287a43] text-white"
                  : result === "unofficial"
                    ? "bg-[#b75d31] text-white"
                    : "bg-[#efeeec] text-[#555]"
              }`}
            >
              {result === "official"
                ? "✓"
                : result === "unofficial"
                  ? "!"
                  : result === "unavailable"
                    ? "—"
                    : "×"}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#1a1a1a]">
                {t(`results.${result}.title`)}
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#777]">
                {t(`results.${result}.desc`)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
