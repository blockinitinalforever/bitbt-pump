import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = (
  process.env.BITBT_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://api.bitbt.com"
).replace(/\/+$/, "");

const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const requestLog = new Map<string, { count: number; resetAt: number }>();

function clientId(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("x-real-ip")?.trim() ||
    forwarded?.split(",")[0]?.trim() ||
    "anonymous"
  );
}

function isRateLimited(request: NextRequest) {
  const key = clientId(request);
  const now = Date.now();
  const current = requestLog.get(key);

  if (requestLog.size > 10_000) {
    for (const [entryKey, entry] of requestLog) {
      if (entry.resetAt <= now) requestLog.delete(entryKey);
    }
  }

  if (!current || current.resetAt <= now) {
    requestLog.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT;
}

/**
 * Same-origin verification entrypoint for the marketing site.
 * Amplify cannot preserve visitor IPs through api.bitbt.com Nginx, so this
 * route enforces the visitor rate limit before proxying to the Rust API.
 */
export async function POST(request: NextRequest) {
  if (isRateLimited(request)) {
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const rawBody = await request.arrayBuffer();
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/official-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: Buffer.from(rawBody),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    const payload = await response
      .json()
      .catch(() => ({ error: "UPSTREAM_ERROR" }));
    return NextResponse.json(payload, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "UPSTREAM_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
