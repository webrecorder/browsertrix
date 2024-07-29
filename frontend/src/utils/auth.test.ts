import { expect } from "@esm-bundle/chai";
import { spy } from "sinon";

import * as auth from "./auth";
import type LiteElement from "./LiteElement";
import appState, { AppStateService } from "./state";

describe("auth", () => {
  beforeEach(() => {
    AppStateService.resetAll();
  });

  describe("needLogin", () => {
    it("dispatches the correct event on need log in", () => {
      const dispatchEventSpy = spy();
      class LiteElementMock {
        dispatchEvent = dispatchEventSpy;
      }

      const Element = auth.needLogin(
        class TestElement extends LiteElementMock {
          appState = appState;
        } as unknown as {
          new (...args: unknown[]): LiteElement;
        },
      );

      const element = new Element();
      element.update(new Map());

      expect(dispatchEventSpy.getCall(0).firstArg.type).to.equal(
        "btrix-need-login",
      );
    });
  });
});
