/**
 * The Library page's "Remove missing photos" dialog: its text used to be
 * hard-coded English ("and it's metadata"), now a translated string with a
 * singular and a plural form.
 */
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../i18n";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("the missing photos confirmation", () => {
  it("agrees with the number of photos", () => {
    expect(i18n.t("settings.missingphotosconfirm", { count: 1 })).toBe(
      "This action will delete the missing photo and its metadata from the database."
    );
    expect(i18n.t("settings.missingphotosconfirm", { count: 47 })).toBe(
      "This action will delete all missing photos and their metadata from the database."
    );
  });
});
