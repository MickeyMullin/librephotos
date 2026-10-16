/**
 * The admin's user editor: the Library picker makes a user a member of
 * another user's library, and the save sends the owner's id.
 */
import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { ModalUserEdit } from "./ModalUserEdit";

const stubs = vi.hoisted(() => ({ updateUser: vi.fn() }));

vi.mock("../../api_client/user/hooks", () => ({
  useManageUpdateUserMutation: () => ({ mutate: stubs.updateUser, isPending: false }),
}));
vi.mock("../../api_client/auth", () => ({ useSignUpMutation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("../../api_client/jobs", () => ({ useScanPhotosMutation: () => ({ mutate: vi.fn() }) }));
vi.mock("../setup/DirectoryPicker", () => ({ DirectoryPicker: () => null }));
vi.mock("../settings/PasswordEntry", () => ({ PasswordEntry: () => null }));

beforeAll(async () => {
  // @ts-ignore - jsdom has no matchMedia, MantineProvider needs it
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  // @ts-ignore - jsdom has no ResizeObserver, the Select's dropdown needs it
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  document.body.innerHTML = "";
  stubs.updateUser.mockReset();
});

const person = (id: number, username: string, libraryOwner: any = null) => ({
  id,
  username,
  email: "",
  first_name: "",
  last_name: "",
  scan_directory: id === 1 ? "/data" : "",
  upload_directory: "",
  library_owner: libraryOwner,
});

const owner = person(1, "alice");
const partner = person(3, "bob");

async function render(userToEdit: any, userList: any[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider env="test">
        <ModalUserEdit isOpen userToEdit={userToEdit} userList={userList} createNew={false} onRequestClose={() => {}} />
      </MantineProvider>
    );
  });
}

const librarySelect = () => document.querySelector<HTMLInputElement>('input[aria-label="Library"]')!;

async function save() {
  await act(async () => {
    Array.from(document.querySelectorAll("button"))
      .find(button => button.textContent === "Save")!
      .click();
  });
}

async function pick(label: string) {
  await act(async () => {
    librarySelect().click();
  });
  await act(async () => {
    Array.from(document.querySelectorAll<HTMLElement>("[role=option]"))
      .find(option => option.textContent === label)!
      .click();
  });
}

describe("ModalUserEdit library", () => {
  it("makes the user a member of another user's library", async () => {
    await render(partner, [owner, partner]);
    expect(librarySelect().value).toBe("Their own library");
    await pick("alice's library");
    await save();
    expect(stubs.updateUser).toHaveBeenCalledTimes(1);
    expect(stubs.updateUser.mock.calls[0][0]).toMatchObject({ id: 3, library_owner: 1 });
  });

  it("sends the owner's id, not the object the user list carries", async () => {
    const member = person(3, "bob", { id: 1, username: "alice", first_name: "", last_name: "" });
    await render(member, [owner, member]);
    expect(librarySelect().value).toBe("alice's library");
    await save();
    expect(stubs.updateUser.mock.calls[0][0].library_owner).toBe(1);
  });

  it("gives a member their own library back", async () => {
    const member = person(3, "bob", { id: 1, username: "alice", first_name: "", last_name: "" });
    await render(member, [owner, member]);
    await pick("Their own library");
    await save();
    expect(stubs.updateUser.mock.calls[0][0].library_owner).toBeNull();
  });

  it("keeps a library others work in from joining another", async () => {
    const member = person(3, "bob", { id: 1, username: "alice", first_name: "", last_name: "" });
    await render(owner, [owner, member]);
    expect(librarySelect().disabled).toBe(true);
    expect(document.body.textContent).toContain("Others work in this user's library");
  });
});
