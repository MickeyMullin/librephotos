/**
 * Whose library the signed-in user works in: their own, or the library
 * owner's for a library member.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useLibraryUserId } from "./useLibraryUserId";

const stubs = vi.hoisted(() => ({ userId: 3 as number | null, self: undefined as any }));

vi.mock("./useAuth", () => ({ useAuth: () => ({ userId: stubs.userId }) }));
vi.mock("../api_client/user/hooks", () => ({
  useCurrentUserSelfDetailsQuery: () => ({ data: stubs.self }),
}));

beforeAll(() => {
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

async function libraryUserId() {
  let result: number | null = null;
  function Probe() {
    result = useLibraryUserId();
    return null;
  }
  await act(async () => {
    createRoot(document.createElement("div")).render(<Probe />);
  });
  return result;
}

describe("useLibraryUserId", () => {
  it("is the user's own id", async () => {
    stubs.self = { id: 3, library_owner: null };
    expect(await libraryUserId()).toBe(3);
  });

  it("is the owner's id for a library member", async () => {
    stubs.self = { id: 3, library_owner: { id: 1, username: "alice", first_name: "", last_name: "" } };
    expect(await libraryUserId()).toBe(1);
  });

  it("falls back to the user's id until their details arrive", async () => {
    stubs.self = undefined;
    expect(await libraryUserId()).toBe(3);
  });
});
