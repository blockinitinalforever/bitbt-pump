import Footer from "@/components/Footer";
import Header from "@/components/Header";
import OfficialVerificationTool from "@/components/OfficialVerificationTool";
import { useTranslations } from "next-intl";

export default function OfficialVerificationPage() {
  const t = useTranslations("verificationPage");

  return (
    <>
      <Header />
      <main className="relative min-h-[calc(100vh-130px)] overflow-x-hidden bg-[#f5f4f2] text-[#1a1a1a]">
        <section className="relative mx-auto flex min-h-[calc(100vh-130px)] max-w-[980px] flex-col px-4 pb-20 pt-28 sm:px-6 sm:pb-24 sm:pt-32 md:px-8 md:pt-36">
          <div
            className="pointer-events-none absolute left-1/2 top-10 h-[420px] w-[min(920px,100vw)] -translate-x-1/2 opacity-70"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,.95) 0%, rgba(245,244,242,0) 70%)",
            }}
          />

          <div className="relative mx-auto w-full max-w-[820px]">
            <div className="mx-auto max-w-[650px] text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#999]">
                {t("eyebrow")}
              </p>
              <h1 className="mt-4 text-[32px] font-extrabold leading-tight tracking-[-0.04em] text-[#1a1a1a] sm:text-[40px] md:text-[48px]">
                {t("title")}
              </h1>
              <p className="mx-auto mt-4 max-w-[620px] text-[13px] leading-6 text-[#777] sm:text-sm">
                {t("desc")}
              </p>
            </div>

            <div className="mt-10 sm:mt-12 md:mt-14">
              <OfficialVerificationTool />
            </div>

            <div className="mt-4 rounded-xl border border-[#e2ded7] bg-[#ece9e4] px-4 py-3.5">
              <p className="text-[11px] leading-5 text-[#7c7268]">
                <span className="mr-2 font-semibold text-[#5f554d]">!</span>
                {t("notes.warning.desc")}
              </p>
            </div>

            <div className="mt-20 border-t border-black/[0.07] pt-5 text-center sm:mt-24">
              <p className="text-[11px] leading-5 text-[#aaa]">
                {t("notes.privacy.desc")}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-[#888]">
                {t("notes.support.desc")}
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
