import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "BitBT PUMP — On-chain project terminal",
  description: "Non-custodial BNB Chain Pump trading with live quotes, charts and transaction receipts.",
};

export default function PumpPage() {
  redirect("/launchpad/bitbt-wallet-ui.html");
}
