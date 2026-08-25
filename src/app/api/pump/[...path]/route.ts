import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.BITBT_PUMP_API_URL || "https://appbackend.bitbt.com";
const ALLOWED = new Set([
  "v1/auth/siwe/nonce",
  "v1/auth/siwe/verify",
  "v1/pump/tokens",
  "v1/pump/detail",
  "v1/pump/buy-quote",
  "v1/pump/sell-quote",
  "v1/pump/trades",
  "v1/wallet/tx/report",
  "v1/token/launch-fee",
  "v1/token/prepare-launch",
  "v1/token/launch",
  "v1/upload/image",
]);

async function forward(request: NextRequest, path: string[]) {
  const key = path.join("/");
  if (!ALLOWED.has(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const upstream = new URL(`/api/${key}`, API_BASE);
  request.nextUrl.searchParams.forEach((value, name) => upstream.searchParams.set(name, value));

  const headers = new Headers({ accept: "application/json", "x-bitbt-client": "bitbt-website" });
  // Next may resolve request.nextUrl.origin to the loopback listener behind
  // Nginx. Use the build-time canonical public domain for the SIWE contract.
  const siweDomain = process.env.NEXT_PUBLIC_PUMP_SIWE_DOMAIN || "bitbt.fun";
  headers.set("origin", `https://${siweDomain}`);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const apiKey = process.env.BITBT_PUMP_API_KEY;
  if (apiKey) headers.set("x-api-key", apiKey);

  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Pump service is temporarily unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}
