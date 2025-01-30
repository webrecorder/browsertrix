import { expect } from "@esm-bundle/chai";
import { spy } from "sinon";

import type LiteElement from "../utils/LiteElement";
import appState, { AppStateService } from "../utils/state";

import needLogin from "./needLogin";

describe("needLogin", () => {
  beforeEach(() => {
    AppStateService.resetAll();
    window.sessionStorage.clear();
  });

  it("dispatches the correct event on need log in", () => {
    const dispatchEventSpy = spy();
    class LiteElementMock {
      dispatchEvent = dispatchEventSpy;
    }

    const Element = needLogin(
      // @ts-expect-error not stubbing full BtrixElement
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
