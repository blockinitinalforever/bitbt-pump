import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":", 1)[0].toLowerCase();
  if (host === "pump.bitbt.com") {
    const redirect = request.nextUrl.clone();
    redirect.protocol = "https:";
    redirect.host = "bitbt.fun";
    return NextResponse.redirect(redirect, 301);
  }
  if (host === "bitbt.fun" || host === "www.bitbt.fun") {
    const rootLocale = request.nextUrl.pathname.match(/^\/(en|zh)\/?$/)?.[1];
    if (rootLocale) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = `/${rootLocale}/pump`;
      redirect.search = "";
      return NextResponse.redirect(redirect, 301);
    }
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
