"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useState } from "react";

export default function ContactPage() {
  const t = useTranslations("contactPage");
  const nav = useTranslations("nav");
  const footer = useTranslations("footer");
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const tabs = [t("tab1"), t("tab2"), t("tab3"), t("tab4")];

  const switchLocale = () => {
    const newLocale = locale === "en" ? "zh" : "en";
    window.location.href = `/${newLocale}/contact`;
  };

  const contactCards = [
    { icon: "✉", label: t("bizLabel"), value: t("bizEmail") },
    { icon: "◈", label: t("investLabel"), value: t("investEmail") },
    { icon: "✈", label: t("tgLabel"), value: t("tgHandle") },
    { icon: "𝕏", label: t("xLabel"), value: t("xHandle") },
  ];

  return (
    <div className="min-h-screen bg-[#f5f4f2]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-2 px-4">
        <nav className="flex items-center gap-[6px] bg-[#efeeec] rounded-full px-[10px] py-2 shadow-sm">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-1.5 bg-black text-[#333] rounded-full px-3.5 py-1.5"
          >
            <span className="text-sm text-white">←</span>
            <span className="text-[13px] font-medium text-white">{nav("back")}</span>
          </Link>
          <div className="flex-1 flex justify-center">
            <Link href={`/${locale}`} className="flex items-center gap-[7px]">
              <div className="w-[22px] h-[22px] bg-[#1a1a1a] rounded-[6px] flex items-center justify-center">
                <svg width="9" height="14" viewBox="0 0 9 14" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M4.712 2.644c.845 0 1.552.12 2.122.36.573.24 1.003.577 1.29 1.01.29.432.435.933.435 1.502 0 .433-.09.819-.27 1.159-.18.336-.428.615-.744.837-.316.222-.682.377-1.097.466v.11c.456.023.876.147 1.262.372.39.226.702.54.937.943.235.4.353.873.353 1.42 0 .61-.154 1.155-.463 1.636-.309.477-.755.854-1.34 1.131-.584.274-1.293.41-2.127.41H.005V4.831l2.728-.008.005-2.179h1.974zM2.733 11.788h1.687c.591 0 1.027-.113 1.306-.338.283-.226.424-.54.424-.943 0-.292-.068-.543-.204-.754a1.309 1.309 0 00-.579-.493 1.915 1.915 0 00-.898-.178H2.733v2.706zm0-4.475h1.51c.298 0 .563-.05.794-.15.232-.1.412-.244.54-.432a1.1 1.1 0 00.199-.682c0-.38-.134-.68-.403-.898-.268-.218-.63-.327-1.086-.327H2.733v2.489z" fill="#fff"/><path d="M0 0h2.738v2.644H0V0z" fill="#fff"/></svg>
              </div>
              <span className="font-bold text-sm text-[#1a1a1a] tracking-[-0.28px]">BitBT Ventures</span>
            </Link>
          </div>
          <button
            onClick={switchLocale}
            className="text-xs text-[#888] font-medium px-2"
          >
            {nav("langSwitch")}
          </button>
        </nav>
      </header>

      {/* Content */}
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-[96px] pb-[80px]">
        <div className="max-w-[1072px] mx-auto">
          {/* Section label */}
          <p className="text-[11px] text-[#aaa] font-medium tracking-[0.1em]">{t("label")}</p>

          {/* Title */}
          <h1 className="mt-5 text-[36px] md:text-[64px] font-extrabold leading-[1.08] tracking-[-0.035em] text-[#1a1a1a]">
            {t("title")}
          </h1>

          {/* Description */}
          <p className="mt-5 text-base text-[#6b6b6b] leading-[1.7] max-w-[540px]">
            {t("desc")}
          </p>

          {/* Form + Sidebar */}
          <div className="mt-14 flex flex-col md:flex-row gap-8">
            {/* Left: Form */}
            <div className="flex-1 max-w-[640px]">
              {/* Tabs */}
              <div className="mb-7">
                <p className="text-xs text-[#aaa] font-medium tracking-[0.72px] mb-3">{t("iAm")}</p>
                <div className="flex flex-wrap gap-2">
                  {tabs.map((tab, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveTab(i)}
                      className={`px-[18px] py-[9px] text-[13px] tracking-[-0.13px] rounded-full border transition-colors ${
                        activeTab === i
                          ? "bg-[#1a1a1a] text-white border-[#1a1a1a]"
                          : "bg-white border-[#e5e5e5] text-[#333] hover:border-[#bbb]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Card */}
              <div className="bg-white border border-[#e5e5e5] rounded-2xl px-5 py-7 md:px-8 md:py-9">

              <p className="text-[13px] text-[#aaa] mb-7">{t("formNote")}</p>

              {submitted ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-[#1a1a1a]">
                    {t("successTitle")}
                  </h3>
                  <p className="text-[#6b6b6b] text-sm">
                    {t("successDesc")}
                  </p>
                </div>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSubmitting(true);
                    const form = e.currentTarget;
                    const formData = new FormData(form);
                    try {
                      const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.bitbt.com";
                      const res = await fetch(`${API_URL}/api/contact`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          role: tabs[activeTab],
                          name: formData.get("name"),
                          company: formData.get("company"),
                          contact: formData.get("contact"),
                          intro: formData.get("intro"),
                        }),
                      });
                      if (res.ok) {
                        setSubmitted(true);
                      } else {
                        alert(t("submitFail"));
                      }
                    } catch {
                      alert(t("networkError"));
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  <div>
                    <label className="block text-xs text-[#6b6b6b] font-medium tracking-[0.12px] mb-1.5">{t("name")}</label>
                    <input
                      name="name"
                      type="text"
                      placeholder={t("namePlaceholder")}
                      className="w-full px-3.5 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-[10px] text-sm text-[#1a1a1a] placeholder:text-[#ccc] focus:outline-none focus:border-[#aaa]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b6b6b] font-medium tracking-[0.12px] mb-1.5">{t("company")}</label>
                    <input
                      name="company"
                      type="text"
                      placeholder={t("companyPlaceholder")}
                      className="w-full px-3.5 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-[10px] text-sm text-[#1a1a1a] placeholder:text-[#ccc] focus:outline-none focus:border-[#aaa]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b6b6b] font-medium tracking-[0.12px] mb-1.5">{t("contact")}</label>
                    <input
                      name="contact"
                      type="text"
                      placeholder={t("contactPlaceholder")}
                      className="w-full px-3.5 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-[10px] text-sm text-[#1a1a1a] placeholder:text-[#ccc] focus:outline-none focus:border-[#aaa]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b6b6b] font-medium tracking-[0.12px] mb-1.5">{t("intro")}</label>
                    <textarea
                      name="intro"
                      placeholder={t("introPlaceholder")}
                      rows={4}
                      className="w-full px-3.5 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-[10px] text-sm text-[#1a1a1a] placeholder:text-[#ccc] focus:outline-none focus:border-[#aaa] resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 bg-[#1a1a1a] text-white rounded-full text-sm font-medium tracking-[-0.14px] hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? t("submitting") : t("submit")}
                  </button>
                </form>
              )}
              </div>
            </div>

            {/* Right: Contact Info */}
            <div className="w-full md:w-[400px] shrink-0">
              <p className="text-xs text-[#aaa] font-medium tracking-[0.72px] mb-4">{t("sidebarLabel")}</p>
              <div className="flex flex-col gap-2">
                {contactCards.map((card, i) => (
                  <div key={i} className="bg-white border border-[#e5e5e5] rounded-xl px-4 py-5 text-center">
                    <span className="text-xl text-[#1a1a1a]">{card.icon}</span>
                    <p className="text-[10px] text-[#aaa] font-medium tracking-[0.8px] mt-2.5">{card.label}</p>
                    <p className="text-xs text-[#1a1a1a] font-medium tracking-[-0.12px] mt-1.5">{card.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 bg-white border border-[#e5e5e5] rounded-xl px-5 py-4 text-center">
                <p className="text-xs text-[#aaa]">{t("responseNote")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white py-10 border-t border-[#e5e5e5]">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-[23px] bg-black rounded-[3px] flex items-center justify-center">
                <svg width="10" height="14" viewBox="0 0 9 14" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M4.712 2.644c.845 0 1.552.12 2.122.36.573.24 1.003.577 1.29 1.01.29.432.435.933.435 1.502 0 .433-.09.819-.27 1.159-.18.336-.428.615-.744.837-.316.222-.682.377-1.097.466v.11c.456.023.876.147 1.262.372.39.226.702.54.937.943.235.4.353.873.353 1.42 0 .61-.154 1.155-.463 1.636-.309.477-.755.854-1.34 1.131-.584.274-1.293.41-2.127.41H.005V4.831l2.728-.008.005-2.179h1.974zM2.733 11.788h1.687c.591 0 1.027-.113 1.306-.338.283-.226.424-.54.424-.943 0-.292-.068-.543-.204-.754a1.309 1.309 0 00-.579-.493 1.915 1.915 0 00-.898-.178H2.733v2.706zm0-4.475h1.51c.298 0 .563-.05.794-.15.232-.1.412-.244.54-.432a1.1 1.1 0 00.199-.682c0-.38-.134-.68-.403-.898-.268-.218-.63-.327-1.086-.327H2.733v2.489z" fill="#fff"/><path d="M0 0h2.738v2.644H0V0z" fill="#fff"/></svg>
              </div>
              <span className="text-[15px] font-bold text-[#1a1a1a] tracking-[-0.3px]">{footer("company")}</span>
            </div>
            <p className="text-xs text-[#aaa] tracking-[-0.12px] mt-2 leading-[1.6]">{footer("desc")}</p>
            <p className="text-[11px] text-[#ccc] mt-1 tracking-[0.11px]">{footer("tagline")}</p>
          </div>
          <p className="text-xs text-[#aaa] tracking-[-0.12px]">{footer("rights")}</p>
        </div>
      </footer>
    </div>
  );
}
