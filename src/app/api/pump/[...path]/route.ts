import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.BITBT_PUMP_API_URL || "https://appbackend.bitbt.com";
const MAX_IMAGE_REQUEST_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  "v1/auth/siwe/nonce",
  "v1/auth/siwe/verify",
  "v1/auth/siwe/session",
  "v1/app/config",
  "v1/pump/tokens",
  "v1/pump/detail",
  "v1/pump/details",
  "v1/pump/buy-quote",
  "v1/pump/sell-quote",
  "v1/pump/trades",
  "v1/wallet/tx/report",
  "v1/wallet/tx/history",
  "v1/market/favorites",
  "v1/token/my-tokens",
  "v1/token/launch-fee",
  "v1/token/prepare-launch",
  "v1/token/launch",
  "v1/upload/image",
]);

async function forward(request: NextRequest, path: string[]) {
  const key = path.join("/");
  if (!ALLOWED.has(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (key === "v1/upload/image" && !request.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ success: false, error: "SIWE session required for image upload" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  if (key === "v1/upload/image") {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_REQUEST_BYTES) {
      return NextResponse.json({ success: false, error: "Image too large (max 5MB)", code: "PAYLOAD_TOO_LARGE" }, { status: 413, headers: { "cache-control": "no-store" } });
    }
  }

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const upstreamMethod = request.method === "HEAD" ? "GET" : request.method;
    const response = await fetch(upstream, {
      method: upstreamMethod,
      headers,
      body: upstreamMethod === "GET" ? undefined : await request.text(),
      cache: "no-store",
      signal: controller.signal,
    });
    if (key === "v1/app/config" && response.ok) {
      const payload = await response.json();
      if (payload?.data && typeof payload.data === "object") {
        delete payload.data.rpc;
        delete payload.data.rpcFallback;
      }
      return request.method === "HEAD"
        ? new NextResponse(null, { status: 200, headers: { "cache-control": "no-store" } })
        : NextResponse.json(payload, { status: response.status, headers: { "cache-control": "no-store" } });
    }
    if (key === "v1/upload/image") {
      const raw = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { success: false, error: response.status === 413 ? "Image too large (max 5MB)" : "Image upload service returned an invalid response" };
      }
      return NextResponse.json(payload, { status: response.status, headers: { "cache-control": "no-store" } });
    }
    return new NextResponse(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Pump service is temporarily unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await context.params).path);
}
