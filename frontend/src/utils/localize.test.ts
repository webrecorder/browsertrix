import { expect } from "@open-wc/testing";
import { restore, stub } from "sinon";

import { Localize } from "./localize";
import { AppStateService } from "./state";

describe("Localize", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    AppStateService.resetAll();
    document.documentElement.lang = "";
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
      expect(localize.languages).to.eql(["en", "es", "ar", "ko"]);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      localize.setLanguage("invalid" as any);
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
        "31/12/23, 16:00",
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      expect(localize.number("a" as any)).to.equal("");
    });

    it("formats with the current language", () => {
      const localize = new Localize("es");
      expect(localize.number(10000)).to.equal("10.000");
    });

    it("formats an ordinal", () => {
      const localize = new Localize();
      expect(localize.number(1, { ordinal: true })).to.equal("1st");
    });
  });

  describe(".date()", () => {
    it("formats with the current language", () => {
      const localize = new Localize("ko");
      expect(localize.date(new Date("2024-01-01T00:00:00.000Z"))).to.equal(
        "23. 12. 31. 오후 04:00",
      );
    });
  });
});
