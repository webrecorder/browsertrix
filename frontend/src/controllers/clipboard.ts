import { msg } from "@lit/localize";
import type { ReactiveController, ReactiveControllerHost } from "lit";

export type CopiedEventDetail = string;

export interface CopiedEventMap {
  "btrix-copied": CustomEvent<CopiedEventDetail>;
}

/**
 * Copy to clipboard
 *
 * @fires btrix-copied
 */
export class ClipboardController implements ReactiveController {
  static readonly text = {
    copy: msg("Copy"),
    copied: msg("Copied"),
  };

  static copyToClipboard(value: string) {
    void navigator.clipboard.writeText(value);
  }

  private readonly host: ReactiveControllerHost & EventTarget;

  private readonly timeout: number = 3000;
  private timeoutId?: number;

  isCopied = false;

  constructor(
    host: ClipboardController["host"],
    { timeout }: { timeout?: number } = {},
  ) {
    if (timeout) {
      this.timeout = timeout;
    }

    this.host = host;
    host.addController(this);
  }

  hostConnected() {}

  hostDisconnected() {
    window.clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
  }

  async copy(value: string) {
    window.clearTimeout(this.timeoutId);

    ClipboardController.copyToClipboard(value);

    this.isCopied = true;

    this.timeoutId = window.setTimeout(() => {
      this.isCopied = false;
      this.host.requestUpdate();
    }, this.timeout);

    this.host.requestUpdate();

    await this.host.updateComplete;

    this.host.dispatchEvent(
      new CustomEvent<CopiedEventDetail>("btrix-copied", { detail: value }),
    );
  }

  reset() {
    if (!this.timeoutId) return;

    window.clearTimeout(this.timeoutId);

    if (this.isCopied) {
      this.isCopied = false;
      this.host.requestUpdate();
    }
  }
}
