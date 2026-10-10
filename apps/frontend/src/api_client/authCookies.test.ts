/**
 * Logging out from any page ends the session.
 *
 * The auth cookies used to be set and removed without a path, which the
 * browser scopes to the current page's folder: a token refreshed on
 * `/search/...` became a second `access` cookie there, and a logout made from
 * that page removed only that one, leaving login's `/` token to sign the user
 * straight back in. jsdom scopes cookies by path the way a browser does, so the
 * sequence is replayed here page by page.
 */
import { Cookies } from "react-cookie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAuthCookies, setAuthCookie } from "./authCookies";

function visit(path: string) {
  window.history.pushState({}, "", path);
}

function accessCookies() {
  return document.cookie
    .split("; ")
    .filter(cookie => cookie.startsWith("access="))
    .sort();
}

afterEach(() => {
  for (const path of ["/", "/search", "/search/deep", "/login", "/librephotos", "/librephotos/search"]) {
    visit(`${path === "/" ? "" : path}/x`);
    for (const name of ["access", "refresh", "jwt"]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=${path}`;
    }
  }
  visit("/");
});

describe("auth cookies", () => {
  it("keeps one token however deep the page that refreshed it", () => {
    visit("/login");
    setAuthCookie("access", "from-login");
    visit("/search/hdr_hlg_hevc");
    setAuthCookie("access", "refreshed");

    expect(accessCookies()).toEqual(["access=refreshed"]);
  });

  it("logs out from a page in a folder", () => {
    visit("/login");
    setAuthCookie("access", "from-login");
    setAuthCookie("refresh", "refresh-token");
    visit("/search/hdr_hlg_hevc");
    setAuthCookie("access", "refreshed");

    clearAuthCookies();

    expect(document.cookie).toBe("");
  });

  it("also clears a copy an older version left in this page's folder", () => {
    visit("/search/hdr_hlg_hevc");
    // What the old code did: no path, so the browser scoped it to /search.
    new Cookies().set("access", "old-scoped");

    clearAuthCookies();

    expect(accessCookies()).toEqual([]);
  });

  it("also clears a copy an older version left in a folder above this page", () => {
    visit("/search/hdr_hlg_hevc");
    new Cookies().set("access", "old-scoped");
    visit("/search/deep/page");

    clearAuthCookies();

    expect(accessCookies()).toEqual([]);
  });

  it("logs out of a subpath install from a page in a folder", () => {
    // VITE_PUBLIC_URL=/librephotos: the old login page scoped its copy to
    // /librephotos, a refresh on a search page to /librephotos/search.
    visit("/librephotos/login");
    new Cookies().set("access", "old-login");
    new Cookies().set("refresh", "old-refresh");
    visit("/librephotos/search/hdr_hlg_hevc");
    new Cookies().set("access", "old-refreshed");
    setAuthCookie("refresh", "refresh-token");

    clearAuthCookies();

    expect(document.cookie).toBe("");
  });

  it("reads the fresh token on a page an older version left a copy on", () => {
    visit("/search/hdr_hlg_hevc");
    new Cookies().set("access", "old-scoped");

    setAuthCookie("access", "refreshed");

    expect(accessCookies()).toEqual(["access=refreshed"]);
    expect(new Cookies().get("access")).toBe("refreshed");
  });

  it("was broken with the old calls, which is what this pins", () => {
    visit("/login");
    new Cookies().set("access", "from-login");
    visit("/search/hdr_hlg_hevc");
    new Cookies().set("access", "refreshed");

    new Cookies().remove("access");

    expect(accessCookies()).toEqual(["access=from-login"]);
  });
});

// A JWT whose payload carries ``exp``; the signature is never checked here.
function tokenExpiringAt(exp: number) {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "none" })}.${encode({ exp })}.sig`;
}

describe("auth cookie lifetime", () => {
  // A session cookie is gone whenever a phone browser is suspended, which
  // signed the user out on every visit.
  it("keeps both cookies until the refresh token expires", () => {
    const set = vi.spyOn(Cookies.prototype, "set");
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    setAuthCookie("refresh", tokenExpiringAt(exp));
    setAuthCookie("access", tokenExpiringAt(exp - 6 * 24 * 3600));

    const expiry = (name: string) => set.mock.calls.find(([cookie]) => cookie === name)?.[2]?.expires;
    expect(expiry("refresh")).toEqual(new Date(exp * 1000));
    // The access token's own expiry is minutes away; the cookie must outlive it.
    expect(expiry("access")).toEqual(new Date(exp * 1000));
    set.mockRestore();
  });

  it("falls back to a session cookie when the token cannot be read", () => {
    const set = vi.spyOn(Cookies.prototype, "set");
    setAuthCookie("refresh", "not-a-jwt");
    expect(set.mock.calls[0][2]).toEqual({ path: "/" });
    set.mockRestore();
  });
});
