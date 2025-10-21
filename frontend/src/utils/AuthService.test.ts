import { expect } from "@open-wc/testing";
import { restore, stub } from "sinon";

import AuthService from "./AuthService";
import { AppStateService } from "./state";

import { APIController } from "@/controllers/api";

describe("AuthService", () => {
  beforeEach(() => {
    AppStateService.resetAll();
    window.sessionStorage.clear();
    window.sessionStorage.clear();
    stub(window.history, "pushState");
    stub(APIController.prototype, "fetch");
    stub(AuthService.prototype, "refresh");
  });

  afterEach(() => {
    restore();
  });

  describe("initSessionStorage()", () => {
    let authService = new AuthService();

    beforeEach(() => {
      authService = new AuthService();
    });

    it("returns auth in session storage", async () => {
      stub(window.sessionStorage, "getItem").returns(
        JSON.stringify({
          headers: { Authorization: "_fake_headers_" },
          tokenExpiresAt: 1111,
          username: "test-auth@example.com",
        }),
      );
      const result = await authService.initSessionStorage();
      expect(result).to.deep.equal({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: 1111,
        username: "test-auth@example.com",
      });
    });
    it("returns auth from another tab", async () => {
      stub(window.sessionStorage, "getItem");
      const otherTabChannel = new BroadcastChannel(AuthService.storageKey);
      otherTabChannel.addEventListener("message", () => {
        otherTabChannel.postMessage({
          name: "responding_auth",
          auth: {
            headers: { Authorization: "_fake_headers_from_tab_" },
            tokenExpiresAt: 9999,
            username: "test-auth@example.com_from_tab_",
          },
        });
      });
      const result = await authService.initSessionStorage();
      expect(result).to.deep.equal({
        headers: { Authorization: "_fake_headers_from_tab_" },
        tokenExpiresAt: 9999,
        username: "test-auth@example.com_from_tab_",
      });
      otherTabChannel.close();
    });
    it("saves auth in session storage", async () => {
      stub(window.sessionStorage, "getItem");
      const otherTabChannel = new BroadcastChannel(AuthService.storageKey);
      otherTabChannel.addEventListener("message", () => {
        otherTabChannel.postMessage({
          name: "responding_auth",
          auth: {
            headers: { Authorization: "_fake_headers_from_tab_to_save_" },
            tokenExpiresAt: 9999,
            username: "test-auth@example.com_from_tab_to_save_",
          },
        });
      });
      await authService.initSessionStorage();
      expect(authService.authState).to.deep.equal({
        headers: { Authorization: "_fake_headers_from_tab_to_save_" },
        tokenExpiresAt: 9999,
        username: "test-auth@example.com_from_tab_to_save_",
      });
      otherTabChannel.close();
    });
    it("resolves without stored auth or another tab", async () => {
      stub(window.sessionStorage, "getItem");
      const result = await authService.initSessionStorage();
      expect(result).to.equal(null);
    });
  });

  describe("AuthService.storage", () => {
    const mockAuth = {
      headers: { Authorization: self.crypto.randomUUID() },
      tokenExpiresAt: Date.now(),
      username: "test-auth@example.com",
    };

    describe(".setItem()", () => {
      it("stores value in window storage", () => {
        stub(AuthService.storage, "getItem").returns("");
        stub(window.sessionStorage, "setItem");

        AuthService.storage.setItem(
          JSON.stringify({
            headers: { Authorization: self.crypto.randomUUID() },
            tokenExpiresAt: Date.now(),
            username: "test-auth@example.com",
          }),
        );

        expect(window.sessionStorage.setItem).to.have.been.called;
      });

      it("does not store the same value", () => {
        stub(AuthService.storage, "getItem").returns(JSON.stringify(mockAuth));
        stub(window.sessionStorage, "setItem");

        AuthService.storage.setItem(JSON.stringify(mockAuth));

        expect(window.sessionStorage.setItem).not.to.have.been.called;
      });
    });
  });

  describe(".authState getter", () => {
    it("is the same as app auth", () => {
      const mockAuth = {
        headers: { Authorization: self.crypto.randomUUID() },
        tokenExpiresAt: Date.now(),
        username: "test-auth@example.com",
      };
      AppStateService.updateAuth(mockAuth);

      expect(new AuthService().authState).to.equal(mockAuth);
    });
  });

  describe(".persist()", () => {
    it("updates auth state", () => {
      stub(AppStateService, "updateAuth");
      const mockAuth = {
        headers: { Authorization: self.crypto.randomUUID() },
        tokenExpiresAt: Date.now(),
        username: "test-auth@example.com",
      };

      new AuthService().persist(mockAuth);

      expect(AppStateService.updateAuth).to.have.been.calledWith(mockAuth);
    });

    it("stores auth state", () => {
      stub(AuthService.storage, "setItem");
      const mockAuth = {
        headers: { Authorization: self.crypto.randomUUID() },
        tokenExpiresAt: Date.now(),
        username: "test-auth@example.com",
      };

      new AuthService().persist(mockAuth);

      expect(AuthService.storage.setItem).to.have.been.calledWith(
        JSON.stringify(mockAuth),
      );
    });
  });
});
