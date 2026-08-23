"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

export default function HeroSection() {
  const t = useTranslations("hero");
  const locale = useLocale();

  const stats = [
    { value: t("stat1Value"), label: t("stat1Label") },
    { value: t("stat2Value"), label: t("stat2Label") },
    { value: t("stat3Value"), label: t("stat3Label") },
  ];

  return (
    <section className="pt-20 md:pt-[80px] border-b border-[#e5e5e5]" id="about">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row gap-8 md:gap-12 py-16 md:py-24">
          {/* Left content */}
          <div className="flex-1">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#ebebeb] border border-[#e0e0e0] rounded-full px-3.5 py-[5px] mb-8">
              <div className="w-1.5 h-1.5 bg-[#1a1a1a] rounded-[3px]" />
              <span className="text-xs text-[#6b6b6b] font-medium tracking-[0.12px]">{t("badge")}</span>
            </div>

            {/* Title */}
            <h1 className="text-[40px] md:text-[60px] lg:text-[76px] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#1a1a1a]">
              {t("title1")}
              <br />
              {t("title2")}
              <br />
              {t("title3")}
            </h1>

            {/* Description */}
            <p className="mt-7 text-[15px] md:text-[17px] text-[#6b6b6b] leading-[1.7] max-w-[520px]">
              {t("desc")}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3 mt-11">
              <Link
                href={`/${locale}/contact`}
                className="inline-flex px-[26px] py-[13px] bg-[#1a1a1a] text-white text-sm font-medium tracking-[-0.14px] rounded-full border border-[#1a1a1a] hover:bg-[#333] transition-colors"
              >
                {t("cta1")}
              </Link>
              <a
                href="#services"
                className="inline-flex px-[26px] py-[13px] bg-white text-[#6b6b6b] text-sm tracking-[-0.14px] rounded-full border border-[#e5e5e5] hover:border-[#ccc] transition-colors"
              >
                {t("cta2")}
              </a>
            </div>
          </div>

          {/* Right - KEY DATA card */}
          <div className="w-full md:w-[280px] shrink-0">
            <div className="bg-white border border-[#e5e5e5] rounded-2xl px-6 py-7">
              <p className="text-[11px] text-[#aaa] font-medium tracking-[0.08em] mb-2">{t("keyData")}</p>
              <div className="space-y-0">
                {stats.map((stat, i) => (
                  <div
                    key={i}
                    className={`py-4 ${i < stats.length - 1 ? "border-b border-[#e5e5e5]" : ""}`}
                  >
                    <p className="text-[22px] md:text-[26px] font-extrabold text-[#1a1a1a] tracking-[-0.78px]">{stat.value}</p>
                    <p className="text-[11px] text-[#6b6b6b] font-medium mt-0.5 tracking-[0.66px]">{stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 bg-[#f5f4f2] rounded-[10px] px-3.5 py-3">
                <p className="text-[11px] text-[#aaa] leading-relaxed">{t("tagline")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
