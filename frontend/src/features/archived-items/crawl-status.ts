import { localized, msg } from "@lit/localize";
import type { SlHideEvent } from "@shoelace-style/shoelace";
import { css, html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import startCase from "lodash/fp/startCase";

import { TailwindElement } from "@/classes/TailwindElement";
import type { CrawlState } from "@/types/crawlState";
import { animatePulse } from "@/utils/css";

type CrawlType = "crawl" | "upload" | "qa";

@customElement("btrix-crawl-status")
@localized()
export class CrawlStatus extends TailwindElement {
  @property({ type: String })
  state?: CrawlState | AnyString;

  @property({ type: Boolean })
  hideLabel = false;

  @property({ type: String })
  type: CrawlType = "crawl";

  @property({ type: Boolean })
  stopping = false;

  @property({ type: Boolean })
  shouldPause = false;

  @property({ type: Boolean })
  hoist = false;

  static styles = [
    animatePulse,
    css`
      :host {
        display: inline-block;
        color: var(--sl-color-neutral-700);
      }

      sl-icon {
        display: block;
        font-size: 1rem;
      }

      sl-skeleton {
        width: 4em;
      }
    `,
  ];

  // TODO look into customizing sl-select multi-select
  // instead of separate utility function?
  static getContent({
    state,
    originalState,
    type = "crawl",
  }: {
    state?: CrawlState | AnyString;
    // `state` might be composed status
    originalState?: CrawlState | AnyString;
    type?: CrawlType | undefined;
  }): {
    icon: TemplateResult;
    label: string;
    cssColor: string;
  } {
    let color = "var(--sl-color-neutral-400)";
    let icon = html`<sl-icon
      name="slash-circle"
      class="neutral"
      slot="prefix"
      style="color: ${color}"
    ></sl-icon>`;
    let label = "";
    let reason = "";

    switch (state) {
      case "starting":
        color = "var(--sl-color-violet-600)";
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
        color = "var(--sl-color-violet-600)";
        icon = html`<sl-icon
          name="hourglass-split"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Waiting");
        reason =
          originalState === "waiting_capacity"
            ? msg("At Capacity")
            : msg("At Crawl Limit");
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
        color = "var(--sl-color-violet-600)";
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopping");
        break;

      case "pausing":
        color = "var(--sl-color-violet-600)";
        icon = html`<sl-icon
          name="pause-circle"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Pausing");
        reason =
          originalState === "pending-wait"
            ? msg("Finishing Downloads")
            : originalState?.endsWith("-wacz")
              ? msg("Creating WACZ")
              : "";
        break;

      case "resuming":
        color = "var(--sl-color-violet-600)";
        icon = html`<sl-icon
          name="play-circle"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Resuming");
        break;

      case "paused":
        color = "var(--sl-color-neutral-500)";
        icon = html`<sl-icon
          name="pause-circle"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Paused");
        break;

      case "pending-wait":
        color = "var(--sl-color-violet-600)";
        icon = html`<sl-icon
          name="dot"
          library="app"
          class="animatePulse"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Finishing Downloads");
        break;

      case "generate-wacz":
        color = "var(--sl-color-violet-600)";
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
        color = "var(--sl-color-violet-600)";
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

      case "skipped_storage_quota_reached":
        color = "var(--danger)";
        icon = html`<sl-icon
          name="exclamation-triangle-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Skipped: Storage Quota Reached");
        break;

      case "skipped_time_quota_reached":
        color = "var(--danger)";
        icon = html`<sl-icon
          name="exclamation-triangle-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Skipped: Time Quota Reached");
        break;

      case "stopped_by_user":
        color = "var(--warning)";
        icon = html`<sl-icon
          name="dash-square-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopped");
        break;

      case "stopped_pause_expired":
        color = "var(--warning)";
        icon = html`<sl-icon
          name="dash-square-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopped: Paused Too Long");
        break;

      case "stopped_storage_quota_reached":
        color = "var(--warning)";
        icon = html`<sl-icon
          name="exclamation-square-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopped: Storage Quota Reached");
        break;

      case "stopped_time_quota_reached":
        color = "var(--warning)";
        icon = html`<sl-icon
          name="exclamation-square-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopped: Time Quota Reached");
        break;

      case "stopped_org_readonly":
        color = "var(--warning)";
        icon = html`<sl-icon
          name="exclamation-square-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopped: Crawling Disabled");
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
    return {
      icon,
      label: reason ? `${label} (${reason})` : label,
      cssColor: color,
    };
  }

  filterState() {
    if (this.stopping && this.state === "running") {
      return "stopping";
    }
    if (this.shouldPause && this.state !== "paused") {
      return "pausing";
    }
    if (!this.shouldPause && this.state === "paused") {
      return "resuming";
    }
    return this.state;
  }

  render() {
    const state = this.filterState();
    const { icon, label } = CrawlStatus.getContent({
      state,
      originalState: this.state,
      type: this.type,
    });
    if (this.hideLabel) {
      return html`<div class="flex items-center">
        <sl-tooltip
          content=${label}
          @sl-hide=${(e: SlHideEvent) => e.stopPropagation()}
          @sl-after-hide=${(e: SlHideEvent) => e.stopPropagation()}
          .hoist=${this.hoist}
        >
          <div>${icon}</div>
        </sl-tooltip>
      </div>`;
    }
    if (label) {
      return html`<div class="flex h-6 items-center gap-2">
        ${icon}
        <div class="leading-none">${label}</div>
      </div>`;
    }
    return html`<div class="flex h-6 items-center gap-2">
      ${icon}<sl-skeleton></sl-skeleton>
    </div>`;
  }
}
