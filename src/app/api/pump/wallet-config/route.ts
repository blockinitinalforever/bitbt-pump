import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE = process.env.BITBT_PUMP_API_URL || "https://appbackend.bitbt.com";

async function resolveProjectId() {
  const local = process.env.WALLETCONNECT_PROJECT_ID?.trim()
    || process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()
    || "";
  if (/^[a-zA-Z0-9_-]{32,128}$/.test(local)) return local;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${API_BASE}/api/v1/connect/capabilities`, {
      cache: "no-store",
      headers: { accept: "application/json", "x-bitbt-client": "bitbt-website" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const projectId = String(payload?.data?.walletconnect?.project_id || "").trim();
    return payload?.data?.walletconnect?.enabled && /^[a-zA-Z0-9_-]{32,128}$/.test(projectId)
      ? projectId
      : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const projectId = await resolveProjectId();

  if (!projectId) {
    return NextResponse.json(
      { success: false, error: "WalletConnect project is not configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        walletConnectProjectId: projectId,
        chainId: 56,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
