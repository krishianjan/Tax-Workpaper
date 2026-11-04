import { NextResponse } from "next/server";

// Role / as-of switcher. A native form POST to a route handler (not a server
// action) so cookie writes always have a proper request scope. Redirects back
// to the page the switch was made on.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const role = String(form.get("role") ?? "st-01");
  const asOf = String(form.get("asOf") ?? "");

  const referer = req.headers.get("referer");
  const back = referer && URL.canParse(referer) ? new URL(referer).pathname + new URL(referer).search : "/";
  const res = NextResponse.redirect(new URL(back || "/", req.url), { status: 303 });

  res.cookies.set("wp_role", role, { httpOnly: false, sameSite: "lax", path: "/" });
  if (asOf) res.cookies.set("wp_asof", asOf, { httpOnly: false, sameSite: "lax", path: "/" });
  return res;
}
