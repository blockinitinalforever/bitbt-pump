import type { Metadata } from "next";
import { useLocale } from "next-intl";
import PumpLiveBoard from "@/components/PumpLiveBoard";

export const metadata: Metadata = {
  title: "BitBT PUMP — On-chain project terminal",
  description: "Non-custodial BNB Chain Pump trading with live quotes, charts and transaction receipts.",
};

export default function PumpPage() {
  const locale = useLocale();
  const zh = locale === "zh";

  return <PumpLiveBoard zh={zh} />;
}
