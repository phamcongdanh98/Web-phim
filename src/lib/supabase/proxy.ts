import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and returns whether a verified user exists.
 *
 * Pages use getUser() (server-validated, never getSession()). `light` mode is for
 * /api/stream: getClaims() verifies the JWT locally and only hits the Auth server when
 * the access token must be refreshed, keeping HTTP Range requests cheap while still
 * rotating the cookie before it expires mid-playback.
 */
export async function updateSession(request: NextRequest, opts: { light?: boolean } = {}) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  let authenticated: boolean;
  if (opts.light) {
    const { data } = await supabase.auth.getClaims();
    authenticated = !!data?.claims?.sub;
  } else {
    const { data } = await supabase.auth.getUser();
    authenticated = !!data.user;
  }
  return { response, authenticated };
}
