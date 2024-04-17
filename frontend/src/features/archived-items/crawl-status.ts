import { localized, msg } from "@lit/localize";
import type { SlHideEvent } from "@shoelace-style/shoelace";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import startCase from "lodash/fp/startCase";

import type { CrawlState } from "@/types/crawler";
import { animatePulse } from "@/utils/css";

type CrawlType = "crawl" | "upload" | "qa";

@localized()
@customElement("btrix-crawl-status")
export class CrawlStatus extends LitElement {
  @property({ type: String })
  state?: CrawlState | AnyString;

  @property({ type: Boolean })
  hideLabel = false;

  @property({ type: String })
  type: CrawlType = "crawl";

  @property({ type: Boolean })
  stopping = false;

  static styles = [
    animatePulse,
    css`
      :host {
        display: inline-block;
        color: var(--sl-color-neutral-700);
      }

      .wrapper,
      .icon-only {
        display: flex;
        align-items: center;
      }

      sl-icon {
        font-size: 1rem;
      }

      .with-label sl-icon,
      :host:not(:last-child) .icon-only {
        margin-right: var(--sl-spacing-x-small);
      }

      .label {
        height: 1rem;
        line-height: 1rem;
      }

      sl-skeleton {
        width: 4em;
      }
    `,
  ];

  // TODO look into customizing sl-select multi-select
  // instead of separate utility function?
  static getContent(
    state?: CrawlState | AnyString,
    type: CrawlType = "crawl",
  ): {
    icon: TemplateResult;
    label: string;
    cssColor: string;
  } {
    let color = "var(--sl-color-neutral-400)";
    let icon = html`<sl-icon
      name="circle"
      class="neutral"
      slot="prefix"
      style="color: ${color}"
    ></sl-icon>`;
    let label = "";

    switch (state) {
      case "starting":
        color = "var(--sl-color-purple-600)";
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Starting");
        break;

      case "waiting_capacity":
      case "waiting_org_limit":
        color = "var(--sl-color-purple-600)";
        icon = html`<sl-icon
          name="hourglass-split"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label =
          state === "waiting_capacity"
            ? msg("Waiting (At Capacity)")
            : msg("Waiting (Crawl Limit)");
        break;

      case "running":
        color = "var(--success)";
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Running");
        break;

      case "stopping":
        color = "var(--sl-color-purple-600)";
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopping");
        break;

      case "pending-wait":
        color = "var(--sl-color-purple-600)";
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Finishing Crawl");
        break;

      case "generate-wacz":
        color = "var(--sl-color-purple-600)";
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Generating WACZ");
        break;

      case "uploading-wacz":
        color = "var(--sl-color-purple-600)";
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Uploading WACZ");
        break;

      case "complete":
        color = "var(--success)";
        icon = html`<sl-icon
          name="check-circle-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = {
          upload: msg("Uploaded"),
          crawl: msg("Complete"),
          qa: msg("Complete"),
        }[type];
        break;

      case "failed":
        color = "var(--danger)";
        icon = html`<sl-icon
          name="exclamation-triangle-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Failed");
        break;

      case "skipped_quota_reached":
        color = "var(--danger)";
        icon = html`<sl-icon
          name="exclamation-triangle-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Skipped: Storage Quota Reached");
        break;

      case "stopped_by_user":
        color = "var(--warning)";
        icon = html`<sl-icon
          name="slash-square-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopped");
        break;

      case "stopped_quota_reached":
        color = "var(--warning)";
        icon = html`<sl-icon
          name="exclamation-square-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopped: Time Quota Reached");
        break;

      case "canceled":
        color = "var(--sl-color-orange-600)";
        icon = html`<sl-icon
          name="x-octagon-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Canceled");
        break;

      default:
        if (typeof state === "string" && state.length) {
          // Handle unknown status
          label = startCase(state);
        }
        break;
    }
    return { icon, label, cssColor: color };
  }

  render() {
    const state =
      this.stopping && this.state === "running" ? "stopping" : this.state;
    const { icon, label } = CrawlStatus.getContent(state, this.type);
    if (this.hideLabel) {
      return html`<div class="icon-only">
        <sl-tooltip
          content=${label}
          @sl-hide=${(e: SlHideEvent) => e.stopPropagation()}
          @sl-after-hide=${(e: SlHideEvent) => e.stopPropagation()}
        >
          <div class="wrapper">${icon}</div>
        </sl-tooltip>
      </div>`;
    }
    if (label) {
      return html`<div class="wrapper with-label">
        ${icon}<span class="label">${label}</span>
      </div>`;
    }
    return html`<div class="wrapper with-label">
      ${icon}<sl-skeleton></sl-skeleton>
    </div>`;
  }
}
