/**
 * A tag edit refetches only the timelines filtered to untagged photos: those
 * are the only views whose contents depend on a photo's tags.
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ queryClient: undefined as unknown as QueryClient }));

vi.mock("../../api", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  stubs.queryClient = new Client();
  return { fetchClient: {}, queryClient: stubs.queryClient };
});

const { invalidateUntaggedTimeline } = await import("./invalidateUntaggedTimeline");

describe("invalidateUntaggedTimeline", () => {
  it("invalidates untagged-only date albums and leaves the rest alone", () => {
    const keys = {
      untaggedList: ["dateAlbums", "none", undefined, undefined, undefined, "all", "untagged=true"],
      untaggedDay: [
        "dateAlbum",
        "none",
        "42",
        1,
        undefined,
        undefined,
        undefined,
        "all",
        "favorite=true&untagged=true",
      ],
      plainList: ["dateAlbums", "none", undefined, undefined, undefined, "all", "none"],
      favoritesDay: ["dateAlbum", "none", "42", 1, undefined, undefined, undefined, "all", "favorite=true"],
      otherQuery: ["tags", "untagged=true"],
    };
    Object.values(keys).forEach(key => stubs.queryClient.setQueryData(key, {}));

    invalidateUntaggedTimeline();

    const invalidated = (key: unknown[]) => stubs.queryClient.getQueryState(key)?.isInvalidated;
    expect(invalidated(keys.untaggedList)).toBe(true);
    expect(invalidated(keys.untaggedDay)).toBe(true);
    expect(invalidated(keys.plainList)).toBe(false);
    expect(invalidated(keys.favoritesDay)).toBe(false);
    expect(invalidated(keys.otherQuery)).toBe(false);
  });
});
