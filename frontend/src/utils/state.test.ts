import { expect } from "@open-wc/testing";

import appState, { makeAppStateService } from "./state";

describe("state", () => {
  describe("appState", () => {
    it("prevents mutations", () => {
      const mockAuth = {
        headers: { Authorization: self.crypto.randomUUID() },
        tokenExpiresAt: Date.now(),
        username: "test-auth@example.com",
      };

      const update = () => (appState.auth = mockAuth);

      expect(update).to.throw();
    });
  });

  describe("AppStateService", () => {
    let AppStateService = makeAppStateService();

    beforeEach(() => {
      AppStateService = makeAppStateService();
    });

    it("updates null auth", () => {
      const mockAuth = null;
      AppStateService.updateAuth(mockAuth);
      expect(AppStateService.appState.auth).to.equal(mockAuth);
    });

    it("updates valid auth", () => {
      const mockAuth = {
        headers: { Authorization: self.crypto.randomUUID() },
        tokenExpiresAt: Date.now(),
        username: "test-auth@example.com",
      };
      AppStateService.updateAuth(mockAuth);
      expect(AppStateService.appState.auth).to.equal(mockAuth);
    });

    it("does not update invalid auth", () => {
      const mockWrongAuth = {
        tokenExpiresAt: Date.now(),
        username: "test-auth@example.com",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      const update = () => AppStateService.updateAuth(mockWrongAuth);

      expect(update).to.throw();
    });
  });
});
