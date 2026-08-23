"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

export default function CtaSection() {
  const t = useTranslations("cta");
  const locale = useLocale();

  const contactCards = [
    { icon: "✉", label: t("bizLabel"), value: t("bizEmail") },
    { icon: "◈", label: t("investLabel"), value: t("investEmail") },
    { icon: "✈", label: t("tgLabel"), value: t("tgHandle") },
    { icon: "𝕏", label: t("xLabel"), value: t("xHandle") },
  ];

  return (
    <section className="bg-white" id="contact">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-[60px] md:py-[100px]">
        <div className="max-w-[900px] mx-auto text-center">
          {/* Section label */}
          <p className="text-[11px] text-[#aaa] font-medium tracking-[0.1em]">{t("label")}</p>

          {/* Title */}
          <h2 className="mt-6 text-[32px] md:text-[52px] lg:text-[60px] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#1a1a1a]">
            {t("title")}
          </h2>

          {/* Description */}
          <p className="mt-5 text-base text-[#6b6b6b] leading-[1.7] max-w-[500px] mx-auto">
            {t("desc")}
          </p>

          {/* CTA Button */}
          <div className="mt-16">
            <Link
              href={`/${locale}/contact`}
              className="inline-flex px-7 py-3.5 bg-[#1a1a1a] text-white text-[15px] font-medium tracking-[-0.15px] rounded-full hover:bg-[#333] transition-colors"
            >
              {t("button")}
            </Link>
          </div>

          {/* Contact Cards */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-[9px]">
            {contactCards.map((card, i) => (
              <div key={i} className="bg-white border border-[#e5e5e5] rounded-2xl px-4 py-6 text-center">
                <div className="w-10 h-10 bg-[#f0f0f0] border border-[#e8e8e8] rounded-[10px] flex items-center justify-center mx-auto mb-3.5">
                  <span className="text-lg text-[#1a1a1a]">{card.icon}</span>
                </div>
                <p className="text-[11px] text-[#aaa] font-medium tracking-[0.88px]">{card.label}</p>
                <p className="text-xs text-[#1a1a1a] font-medium tracking-[-0.12px] mt-1.5">{card.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
