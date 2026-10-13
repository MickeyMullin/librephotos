/**
 * The header's subheader can hold the controls that change what is shown, such
 * as the tag search's pickers. It used to sit in a different place in the tree
 * when the empty state was showing, so picking the first tag (empty, then
 * loading) remounted the picker and took the focus out of it.
 */
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DefaultHeader } from "./DefaultHeader";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({ state: { location: { pathname: "/album/tags/search" } } }),
}));
vi.mock("../../api_client/auth/hooks", () => ({ useAccessToken: () => ({ data: undefined }) }));
vi.mock("../../api_client/user/hooks", () => ({
  useFetchUserSelfDetailsQuery: () => ({ data: undefined }),
  useFetchUserListQuery: () => ({ data: undefined }),
}));
vi.mock("../modals/ModalUserEdit", () => ({ ModalUserEdit: () => null }));

beforeAll(() => {
  // @ts-ignore - jsdom has no matchMedia, MantineProvider needs it
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("DefaultHeader", () => {
  it("keeps the subheader's controls, and their focus, from the empty state through loading to results", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (state: { loading: boolean; items: number }) =>
      act(async () =>
        root.render(
          <MantineProvider env="test">
            <DefaultHeader
              loading={state.loading}
              numPhotosetItems={state.items}
              numPhotos={state.items}
              icon={<span />}
              title="Search by tags"
              additionalSubHeader={<input aria-label="tags" />}
              dayHeaderPrefix=""
              date=""
              hasEmptyState
            />
          </MantineProvider>
        )
      );

    await render({ loading: false, items: 0 });
    const input = container.querySelector("input")!;
    input.focus();

    for (const state of [
      { loading: true, items: 0 },
      { loading: false, items: 3 },
      { loading: false, items: 0 },
    ]) {
      await render(state);
      expect(container.querySelector("input")).toBe(input);
      expect(document.activeElement).toBe(input);
    }

    await act(async () => root.unmount());
    container.remove();
  });
});
