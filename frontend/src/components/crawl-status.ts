import { LitElement, html, css } from "lit";
import { property, queryAssignedElements } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import startCase from "lodash/fp/startCase";

import type { Crawl } from "../types/crawler";
import { animatePulse } from "../utils/css";

@localized()
export class CrawlStatus extends LitElement {
  @property({ type: String })
  state?: Crawl["state"];

  static styles = [
    animatePulse,
    css`
      :host {
        color: var(--sl-color-neutral-700);
      }

      sl-icon,
      sl-skeleton,
      span {
        display: inline-block;
        vertical-align: middle;
      }

      sl-icon {
        font-size: 1rem;
        margin-right: var(--sl-spacing-x-small);
      }

      sl-skeleton {
        width: 4em;
      }

      .success {
        color: var(--success);
      }

      .danger {
        color: var(--danger);
      }

      .neutral {
        color: var(--sl-color-neutral-300);
      }
    `,
  ];

  render() {
    let icon = html`<sl-icon
      name="dot"
      library="app"
      class="neutral"
    ></sl-icon>`;
    let label = html`<sl-skeleton></sl-skeleton>`;

    switch (this.state) {
      case "starting": {
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="success animate-pulse"
        ></sl-icon>`;
        label = html`<span>${msg("Starting")}</span>`;
        break;
      }

      case "running": {
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="success animate-pulse"
        ></sl-icon>`;
        label = html`<span>${msg("Running")}</span>`;
        break;
      }

      case "stopping": {
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="danger animate-pulse"
        ></sl-icon>`;
        label = html`<span>${msg("Stopping")}</span>`;
        break;
      }

      case "complete": {
        icon = html`<sl-icon name="check-circle" class="success"></sl-icon>`;
        label = html`<span>${msg("Complete")}</span>`;
        break;
      }

      case "failed": {
        icon = html`<sl-icon
          name="exclamation-triangle"
          class="danger"
        ></sl-icon>`;
        label = html`<span>${msg("Failed")}</span>`;
        break;
      }

      case "partial_complete": {
        icon = html`<sl-icon name="circle"></sl-icon>`;
        label = html`<span>${msg("Stopped")}</span>`;
        break;
      }

      case "timed_out": {
        icon = html`<sl-icon name="circle"></sl-icon>`;
        label = html`<span>${msg("Timed Out")}</span>`;
        break;
      }

      case "canceled": {
        icon = html`<sl-icon name="x-octagon" class="danger"></sl-icon>`;
        label = html`<span>${msg("Canceled")}</span>`;
        break;
      }

      default: {
        if (typeof this.state === "string" && (this.state as string).length) {
          // Handle unknown status
          label = html`<span>${startCase(this.state)}</span>`;
        }
        break;
      }
    }
    return html`${icon}${label}`;
  }
}
