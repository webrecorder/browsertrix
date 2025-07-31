import { msg } from "@lit/localize";
import { html } from "lit";

export const ShareableNotice = () =>
  html`<btrix-popover
    content=${msg(
      "The latest crawl from this workflow is publicly accessible to anyone with the link. This can be changed with the Browsertrix API.",
    )}
  >
    <btrix-badge class="min-h-5" variant="warning">
      <sl-icon name="info-circle" class="align-icon mr-1"></sl-icon>
      ${msg("Public")}
    </btrix-badge>
  </btrix-popover>`;
