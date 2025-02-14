import { expect } from "@open-wc/testing";
import { restore, stub } from "sinon";

import { Localize, mergeLocales } from "./localize";
import { AppStateService } from "./state";

describe("Localize", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    AppStateService.resetAll();
    document.documentElement.lang = "";
    AppStateService.partialUpdateUserPreferences({
      useBrowserLanguageForFormatting: false,
    });
    // TODO write tests with for `useBrowserLanguageForFormatting`
  });

  afterEach(() => {
    restore();
  });

  describe("constructor", () => {
    it("sets the correct active language", () => {
      expect(new Localize().activeLanguage).to.equal("en");
      expect(new Localize("es").activeLanguage).to.equal("es");
    });
  });

  describe(".activeLanguage", () => {
    it("gets the correct language", () => {
      const localize = new Localize();
      document.documentElement.lang = "es";
      expect(localize.activeLanguage).to.equal("es");
    });
  });

  describe(".languages", () => {
    it("returns the correct languages", () => {
      stub(window.navigator, "languages").get(() => ["en-US", "ar", "ko"]);
      const localize = new Localize();
      expect(localize.languages).to.eql(["de", "en", "es", "fr", "pt"]);
    });
  });

  describe(".initLanguage()", () => {
    it("sets the language from app state", () => {
      const localize = new Localize();
      AppStateService.partialUpdateUserPreferences({ language: "es" });
      localize.initLanguage();
      expect(localize.activeLanguage).to.equal("es");
    });
  });

  describe(".setLanguage()", () => {
    it("doesn't set an invalid language code", () => {
      const localize = new Localize();
      // @ts-expect-error testing with an invalid language code
      localize.setLanguage("invalid");
      expect(localize.activeLanguage).to.equal("en");
    });

    it("updates the number formatter", () => {
      const localize = new Localize();
      localize.setLanguage("es");
      expect(localize.number(10000)).to.equal("10.000");
    });

    it("updates the date formatter", () => {
      const localize = new Localize();
      localize.setLanguage("es");
      expect(localize.date(new Date("2024-01-01T00:00:00.000Z"))).to.equal(
        "31/12/2023, 19:00",
      );
    });

    it("updates the duration formatter", () => {
      const localize = new Localize();
      localize.setLanguage("ar");
      expect(localize.duration({ days: 1, hours: 2, minutes: 3 })).to.equal(
        "1 ي و2 س و3 د",
      );
    });

    it("sets the active language", () => {
      const localize = new Localize();
      localize.setLanguage("es");
      expect(localize.activeLanguage).to.equal("es");
    });

    // it('sets translation', () => {
    // TODO
    // })
  });

  describe(".number()", () => {
    it("returns if not a number", () => {
      const localize = new Localize();
      // @ts-expect-error testing with a non-number
      expect(localize.number("a")).to.equal("");
    });

    it("formats with the current language", () => {
      const localize = new Localize("es");
      expect(localize.number(10000)).to.equal("10.000");
    });
  });

  describe(".date()", () => {
    it("formats with the current language", () => {
      const localize = new Localize("ko");
      expect(localize.date(new Date("2024-01-01T00:00:00.000Z"))).to.equal(
        "2023. 12. 31. 오후 07:00",
      );
    });

    it("accepts time zone", () => {
      const localize = new Localize("ko");
      expect(
        localize.date(new Date("2024-01-01T00:00:00.000Z"), {
          timeZone: "UTC",
        }),
      ).to.equal("2024. 1. 1.");
    });
  });

  describe(".duration()", () => {
    it("formats a duration", () => {
      const localize = new Localize("am");
      expect(
        localize.duration({
          days: 1,
          hours: 2,
          minutes: 3,
          seconds: 4,
          milliseconds: 5,
        }),
      ).to.equal("1 ቀ፣ 2 ሰ፣ 3 ደ፣ 4 ሰ 5 ሚሴ");
    });

    it("formats an empty duration", () => {
      const localize = new Localize("am");
      expect(localize.duration({ seconds: 0 })).to.equal("");
    });

    it("errors with an invalid duration", () => {
      const localize = new Localize("am");
      // @ts-expect-error empty object shouldn't be allowed
      expect(() => localize.duration({})).to.throw();
    });
  });

  // TODO test `.ordinal()`
});

describe("mergeLocales", () => {
  it("returns the target lang when navigator locales don't overlap", () => {
    expect(mergeLocales("fr", false, ["en-US", "ar", "ko"])).to.deep.equal([
      "fr",
    ]);
  });

  it("returns the target lang last when navigator locales do overlap", () => {
    expect(
      mergeLocales("fr", false, ["fr-FR", "fr-CA", "fr-CH"]),
    ).to.deep.equal(["fr-FR", "fr-CA", "fr-CH", "fr"]);
  });

  it("returns the target lang in place last when navigator locales does overlap and contains target lang exactly", () => {
    expect(
      mergeLocales("fr", false, ["fr-FR", "fr", "fr-CA", "fr-CH"]),
    ).to.deep.equal(["fr-FR", "fr", "fr-CA", "fr-CH"]);
  });

  it("handles more complicated locale strings", () => {
    expect(
      mergeLocales("fr", false, [
        "fr-u-CA-gregory-hc-h12",
        "ja-Jpan-JP-u-ca-japanese-hc-h12",
        "fr-Latn-FR-u-ca-gregory-hc-h12",
        "fr-CA",
      ]),
    ).to.deep.equal([
      "fr-u-CA-gregory-hc-h12",
      "fr-Latn-FR-u-ca-gregory-hc-h12",
      "fr-CA",
      "fr",
    ]);
  });

  // TODO test with `useNavigatorLocales = true`
});
