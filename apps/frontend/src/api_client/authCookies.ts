import { jwtDecode } from "jwt-decode";
import { Cookies } from "react-cookie";

/**
 * The web keeps its JWTs in script-readable cookies, and every one of them
 * lives at the site root.
 *
 * A cookie set without a path is scoped by the browser to the folder of the
 * page that set it. A token refreshed while browsing `/search/...` became a
 * second `access` cookie at `/search`, next to the one login left at `/`; and a
 * cookie removed without a path is removed only from the current folder. So
 * logging out from `/search/...` left the `/` token in place, the next request
 * sent it, and the app was signed straight back in -- until a logout happened
 * to be made from the right page.
 */
export const AUTH_COOKIE_OPTIONS = { path: "/" } as const;

const AUTH_COOKIES = ["access", "refresh", "jwt"] as const;

/**
 * Every folder an earlier version could have left a copy in that this page
 * can see: `/` and each folder above the page, down to its own. On
 * `/librephotos/search/x` that is `/`, `/librephotos` and
 * `/librephotos/search`.
 *
 * The browser scopes a cookie set without a path to the page's folder: the
 * path up to, but not including, its last `/` (or `/` itself when that is the
 * only one). A page sees the cookies of its own folder and of every folder
 * above it, so a copy made on any of those pages -- the login page of a
 * subpath install at `/librephotos`, say -- is one of these.
 */
function visibleCookieFolders() {
  const folders = ["/"];
  let folder = "";
  // Drop the leading "" and the page's own name: what is left are the folders.
  for (const segment of window.location.pathname.split("/").slice(1, -1)) {
    folder += `/${segment}`;
    folders.push(folder);
  }
  return folders;
}

/**
 * When the login stops being renewable: the expiry of the refresh token,
 * ``refreshToken`` or else the one already stored. Undefined when there is
 * none or it cannot be read.
 */
function loginExpiry(refreshToken?: string): Date | undefined {
  const token: string | undefined = refreshToken ?? new Cookies().get("refresh");
  if (!token) return undefined;
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    return exp ? new Date(exp * 1000) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Store a token, kept until the login it belongs to expires.
 *
 * A cookie without an expiry is a session cookie, and phone browsers end the
 * session whenever the system suspends or closes them, which on iOS is all the
 * time: the user had to sign in again on every visit. Both cookies therefore
 * live as long as the refresh token. The access cookie too, though its token
 * lasts only minutes: its presence is what tells the app it is signed in (the
 * token itself is refreshed on the first 401), so it must not vanish first.
 * Set the refresh cookie before the access one, so the access cookie gets the
 * new login's expiry.
 */
export function setAuthCookie(name: "access" | "refresh", value: string) {
  const cookies = new Cookies();
  // A copy an earlier version scoped to a folder is listed before the `/` one
  // on this page -- longer paths come first -- and would be read instead of
  // the fresh token.
  for (const folder of visibleCookieFolders().slice(1)) {
    cookies.remove(name, { path: folder });
  }
  const expires = loginExpiry(name === "refresh" ? value : undefined);
  cookies.set(name, value, expires ? { ...AUTH_COOKIE_OPTIONS, expires } : AUTH_COOKIE_OPTIONS);
}

export function clearAuthCookies() {
  const cookies = new Cookies();
  for (const name of AUTH_COOKIES) {
    // The `/` cookie, and any copy an earlier version left above this page.
    for (const folder of visibleCookieFolders()) {
      cookies.remove(name, { path: folder });
    }
  }
}
