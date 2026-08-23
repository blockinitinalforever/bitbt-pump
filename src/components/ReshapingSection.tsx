import { useTranslations } from "next-intl";

export default function ReshapingSection() {
  const t = useTranslations("about");

  const items = [
    { num: t("item1Num"), title: t("item1Title"), desc: t("item1Desc") },
    { num: t("item2Num"), title: t("item2Title"), desc: t("item2Desc") },
    { num: t("item3Num"), title: t("item3Title"), desc: t("item3Desc") },
    { num: t("item4Num"), title: t("item4Title"), desc: t("item4Desc") },
    { num: t("item5Num"), title: t("item5Title"), desc: t("item5Desc") },
  ];

  return (
    <section className="py-[60px] md:py-[120px] border-b border-[#e5e5e5]">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8">
        {/* Section label */}
        <p className="text-[11px] text-[#aaa] font-medium tracking-[0.1em]">{t("label")}</p>

        {/* Title */}
        <h2 className="mt-5 text-[32px] md:text-[52px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#1a1a1a] max-w-[580px]">
          {t("title")}
        </h2>

        {/* Two columns */}
        <div className="mt-12 md:mt-[72px] flex flex-col md:flex-row gap-10 md:gap-[80px]">
          {/* Left - descriptions */}
          <div className="flex-1 max-w-[528px]">
            <p className="text-[15px] text-[#6b6b6b] leading-[1.8]">{t("desc1")}</p>
            <p className="text-[15px] text-[#6b6b6b] leading-[1.8] mt-5">{t("desc2")}</p>
            {/* Quote box */}
            <div className="mt-10 bg-white border border-[#1a1a1a] px-5 py-6">
              <p className="text-[17px] text-[#1a1a1a] leading-[1.65]">{t("quote")}</p>
            </div>
          </div>

          {/* Right - list cards */}
          <div className="flex-1 space-y-2">
            {items.map((item, i) => (
              <div
                key={i}
                className="bg-white border border-[#e5e5e5] rounded-[14px] px-[18px] py-4 flex items-start gap-3.5"
              >
                <span className="text-[11px] text-[#bbb] font-medium tracking-[0.44px] mt-0.5 shrink-0">{item.num}</span>
                <div>
                  <h3 className="text-sm font-semibold text-[#1a1a1a] tracking-[-0.14px]">{item.title}</h3>
                  <p className="text-[13px] text-[#6b6b6b] mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
