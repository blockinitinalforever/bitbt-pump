import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${routing.locales.includes(locale as "en" | "zh") ? locale : routing.defaultLocale}/pump`);
}
