import { localized, msg } from "@lit/localize";
import { css, html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import startCase from "lodash/fp/startCase";

import { TailwindElement } from "@/classes/TailwindElement";
import { labelWithIcon } from "@/layouts/labelWithIcon";
import {
  PAUSED_STATES,
  RUNNING_STATES,
  type CrawlState,
} from "@/types/crawlState";
import { isPaused } from "@/utils/crawler";
import { animatePulse } from "@/utils/css";

type CrawlType = "crawl" | "qa";

/**
 * Displays the status of a crawl type archived item, QA run, or workflow.
 */
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
    let reason = originalState
      ? originalState.endsWith("_storage_quota_reached")
        ? msg("Storage Quota Reached")
        : originalState.endsWith("_time_quota_reached")
          ? msg("Time Quota Reached")
          : originalState.endsWith("_org_readonly")
            ? msg("Crawling Disabled")
            : ""
      : "";
    let substate = "";

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
      case "waiting":
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
            : originalState === "waiting_org_limit"
              ? msg("At Crawl Limit")
              : originalState === "waiting_dedupe_index"
                ? msg("Dedupe Index")
                : "";
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
        substate =
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
          crawl: msg("Complete"),
          qa: msg("Complete"),
        }[type];
        break;

      case "failed": {
        color = "var(--danger)";
        icon = html`<sl-icon
          name="x-octagon-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Failed");
        reason =
          originalState === "failed_not_logged_in" ? msg("Not Logged In") : "";
        break;
      }

      case "skipped":
        color = "var(--danger)";
        icon = html`<sl-icon
          name="exclamation-triangle-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Skipped");
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
      case "stopped_storage_quota_reached":
      case "stopped_time_quota_reached":
      case "stopped_org_readonly": {
        color = "var(--warning)";
        icon = html`<sl-icon
          name="exclamation-square-fill"
          slot="prefix"
          style="color: ${color}"
        ></sl-icon>`;
        label = msg("Stopped");
        reason =
          originalState === "stopped_pause_expired"
            ? msg("Paused Too Long")
            : reason;
        break;
      }

      case "canceled":
        color = "var(--sl-color-neutral-600)";
        icon = html`<sl-icon
          name="x-octagon"
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
      label: `${label}${reason ? `: ${reason}` : ""}${substate ? ` (${substate})` : ""}`,
      cssColor: color,
    };
  }

  filterState() {
    if (!this.state) return "";
    if (this.stopping && this.state === "running") {
      return "stopping";
    }
    if (
      this.shouldPause &&
      (RUNNING_STATES as readonly string[]).includes(this.state)
    ) {
      return "pausing";
    }
    if (!this.shouldPause && isPaused(this.state)) {
      return "resuming";
    }
    if ((PAUSED_STATES as readonly string[]).includes(this.state)) {
      return "paused";
    }
    if (this.state.startsWith("waiting_")) {
      return "waiting";
    }
    if (this.state.startsWith("failed_")) {
      return "failed";
    }
    if (this.state.startsWith("skipped_")) {
      return "skipped";
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

    return labelWithIcon({ icon, label, hideLabel: this.hideLabel });
  }
}
