import { LitElement, html, css, TemplateResult } from "lit";
import { property, queryAssignedElements } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import startCase from "lodash/fp/startCase";

import type { CrawlState } from "../types/crawler";
import { animatePulse } from "../utils/css";

@localized()
export class CrawlStatus extends LitElement {
  @property({ type: String })
  state?: CrawlState;

  @property({ type: Boolean })
  hideLabel = false;

  static styles = [
    animatePulse,
    css`
      :host {
        contain: content;
        display: inline-flex;
        align-items: center;
        color: var(--sl-color-neutral-700);
      }

      sl-icon {
        font-size: 1rem;
        margin-right: var(--sl-spacing-x-small);
      }

      sl-skeleton {
        width: 4em;
      }
    `,
  ];

  // TODO look into customizing sl-select multi-select
  // instead of separate utility function?
  static getContent(state?: CrawlState): {
    icon: TemplateResult;
    label: string;
  } {
    let icon = html`<sl-icon
      name="circle"
      class="neutral"
      slot="prefix"
      style="color: var(--sl-color-neutral-400)"
    ></sl-icon>`;
    let label = "";

    switch (state) {
      case "starting": {
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--success)"
        ></sl-icon>`;
        label = msg("Starting");
        break;
      }

      case "running": {
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--success)"
        ></sl-icon>`;
        label = msg("Running");
        break;
      }

      case "stopping": {
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: var(--danger)"
        ></sl-icon>`;
        label = msg("Stopping");
        break;
      }

      case "complete": {
        icon = html`<sl-icon
          name="check-circle"
          slot="prefix"
          style="color: var(--success)"
        ></sl-icon>`;
        label = msg("Complete");
        break;
      }

      case "failed": {
        icon = html`<sl-icon
          name="exclamation-triangle"
          slot="prefix"
          style="color: var(--danger)"
        ></sl-icon>`;
        label = msg("Failed");
        break;
      }

      case "partial_complete": {
        icon = html`<sl-icon name="dash-circle" slot="prefix"></sl-icon>`;
        label = msg("Stopped");
        break;
      }

      case "timed_out": {
        icon = html`<sl-icon
          name="exclamation-circle"
          slot="prefix"
        ></sl-icon>`;
        label = msg("Timed Out");
        break;
      }

      case "canceled": {
        icon = html`<sl-icon
          name="x-octagon"
          slot="prefix"
          style="color: var(--danger)"
        ></sl-icon>`;
        label = msg("Canceled");
        break;
      }

      default: {
        if (typeof state === "string" && (state as string).length) {
          // Handle unknown status
          label = startCase(state);
        }
        break;
      }
    }
    return { icon, label };
  }

  render() {
    const { icon, label } = CrawlStatus.getContent(this.state);
    if (this.hideLabel) {
      return icon;
    }
    if (label) {
      return html`${icon}<span>${label}</span>`;
    }
    return html`${icon}<sl-skeleton></sl-skeleton>`;
  }
}
