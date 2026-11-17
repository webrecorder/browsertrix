import { msg } from "@lit/localize";
import type { SlChangeEvent, SlRadioGroup } from "@shoelace-style/shoelace";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { type SearchParamsValue } from "@/controllers/searchParamsValue";

export enum ReplayView {
  Sidebar = "sidebar",
  Stacked = "stacked",
}
export const DEFAULT_REPLAY_VIEW = ReplayView.Sidebar;

export function pageListViewControl(
  replayView: SearchParamsValue<ReplayView | undefined>,
) {
  return html`<label class="flex gap-2 items-center text-neutral-500">
    ${msg("View:")}
    <sl-radio-group
      value=${ifDefined(replayView.value)}
      size="small"
      @sl-change=${(e: SlChangeEvent) => {
        replayView.setValue((e.target as SlRadioGroup).value as ReplayView);
      }}
    >
      <sl-tooltip content=${msg("View Pages to Side")}>
        <sl-radio-button pill value=${ReplayView.Sidebar}>
          <sl-icon
            name="layout-sidebar-inset-reverse"
            label=${msg("Side of Replay")}
          ></sl-icon>
        </sl-radio-button>
      </sl-tooltip>
      <sl-tooltip content=${msg("View Pages Below Replay")}>
        <sl-radio-button pill value=${ReplayView.Stacked}>
          <sl-icon name="window-desktop" label=${msg("Below Replay")}></sl-icon>
        </sl-radio-button>
      </sl-tooltip>
    </sl-radio-group>
  </label>`;
}
