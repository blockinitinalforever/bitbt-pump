"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = () => {
    const nextLocale = locale === "en" ? "zh" : "en";
    const pathWithoutLocale = pathname.replace(`/${locale}`, "") || "/pump";
    router.push(`/${nextLocale}${pathWithoutLocale === "/" ? "/pump" : pathWithoutLocale}`);
  };

  return (
    <header className="fixed left-0 right-0 top-2 z-50 flex justify-center px-4">
      <nav className="flex w-full max-w-[1180px] items-center justify-between rounded-full bg-[#efeeec] px-4 py-2.5 shadow-sm sm:px-5">
        <Link href={`/${locale}/pump`} className="flex items-center gap-[7px]">
          <Image src="/icon.svg" alt="BitBT PUMP" width={22} height={22} className="rounded-[6px]" />
          <span className="text-sm font-bold tracking-[-0.28px] text-[#1a1a1a]">BitBT PUMP</span>
        </Link>
        <button onClick={switchLocale} className="rounded-full px-3 py-2 text-xs font-medium tracking-[0.24px] text-[#888] hover:bg-black/5" aria-label={t("langSwitch")}>
          {t("langSwitch")}
        </button>
      </nav>
    </header>
  );
}
