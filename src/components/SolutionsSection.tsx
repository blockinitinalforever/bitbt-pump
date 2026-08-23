import { useTranslations } from "next-intl";

export default function SolutionsSection() {
  const t = useTranslations("services");

  const cards = [
    { num: t("card1Num"), title: t("card1Title"), tags: t("card1Tags").split(",") },
    { num: t("card2Num"), title: t("card2Title"), tags: t("card2Tags").split(",") },
    { num: t("card3Num"), title: t("card3Title"), tags: t("card3Tags").split(",") },
    { num: t("card4Num"), title: t("card4Title"), tags: t("card4Tags").split(",") },
    { num: t("card5Num"), title: t("card5Title"), tags: t("card5Tags").split(",") },
    { num: t("card6Num"), title: t("card6Title"), tags: t("card6Tags").split(",") },
  ];

  return (
    <section className="py-[60px] md:py-[120px] border-b border-[#e5e5e5]" id="services">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8">
        {/* Section label */}
        <p className="text-[11px] text-[#aaa] font-medium tracking-[0.1em]">{t("label")}</p>

        {/* Title */}
        <h2 className="mt-5 text-[32px] md:text-[52px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#1a1a1a]">
          {t("title")}
        </h2>

        {/* Cards grid */}
        <div className="mt-10 md:mt-[56px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((card, i) => (
            <div
              key={i}
              className="bg-white border border-[#e5e5e5] rounded-2xl px-6 py-7"
            >
              <div className="w-7 h-7 bg-[#f0f0f0] border border-[#e8e8e8] rounded-lg flex items-center justify-center mb-5">
                <span className="text-[11px] text-[#aaa] font-medium tracking-[0.22px]">{card.num}</span>
              </div>
              <h3 className="text-[17px] font-bold text-[#1a1a1a] tracking-[-0.34px] pb-4 border-b border-[#f0f0f0]">{card.title}</h3>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {card.tags.map((tag, j) => (
                  <span
                    key={j}
                    className="text-[11px] text-[#6b6b6b] font-medium tracking-[0.11px] bg-[#f0f0f0] border border-[#e8e8e8] px-2.5 py-1 rounded-[6px]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
