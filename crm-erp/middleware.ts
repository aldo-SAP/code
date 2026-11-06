import { NextResponse, type NextRequest } from "next/server";

/** Passes the requested path to server components, so a login redirect can come back to it. */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|healthz).*)"] };
