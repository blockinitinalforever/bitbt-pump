import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="bg-white border-t border-[#e5e5e5] py-10">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-[23px] bg-black rounded-[3px] flex items-center justify-center">
              <svg width="10" height="14" viewBox="0 0 9 14" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M4.712 2.644c.845 0 1.552.12 2.122.36.573.24 1.003.577 1.29 1.01.29.432.435.933.435 1.502 0 .433-.09.819-.27 1.159-.18.336-.428.615-.744.837-.316.222-.682.377-1.097.466v.11c.456.023.876.147 1.262.372.39.226.702.54.937.943.235.4.353.873.353 1.42 0 .61-.154 1.155-.463 1.636-.309.477-.755.854-1.34 1.131-.584.274-1.293.41-2.127.41H.005V4.831l2.728-.008.005-2.179h1.974zM2.733 11.788h1.687c.591 0 1.027-.113 1.306-.338.283-.226.424-.54.424-.943 0-.292-.068-.543-.204-.754a1.309 1.309 0 00-.579-.493 1.915 1.915 0 00-.898-.178H2.733v2.706zm0-4.475h1.51c.298 0 .563-.05.794-.15.232-.1.412-.244.54-.432a1.1 1.1 0 00.199-.682c0-.38-.134-.68-.403-.898-.268-.218-.63-.327-1.086-.327H2.733v2.489z" fill="#fff"/><path d="M0 0h2.738v2.644H0V0z" fill="#fff"/></svg>
            </div>
            <span className="text-[15px] font-bold text-[#1a1a1a] tracking-[-0.3px]">{t("company")}</span>
          </div>
          <p className="text-xs text-[#aaa] tracking-[-0.12px] mt-2 leading-[1.6]">{t("desc")}</p>
          <p className="text-[11px] text-[#ccc] mt-1 tracking-[0.11px]">{t("tagline")}</p>
        </div>
        <p className="text-xs text-[#aaa] tracking-[-0.12px]">{t("rights")}</p>
      </div>
    </footer>
  );
}
