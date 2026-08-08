import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { labelWithIcon } from "@/layouts/labelWithIcon";
import { animatePulse } from "@/utils/css";

@customElement("btrix-upload-status")
@localized()
export class UploadStatus extends TailwindElement {
  @property({ type: String })
  state?: "complete" | "processing-upload" | "failed" | AnyString;

  @property({ type: Boolean })
  hideLabel = false;

  static styles = [animatePulse];

  render() {
    let icon = html`<sl-icon
      name="slash-circle"
      class="text-neutral-400"
    ></sl-icon>`;
    let label: string | undefined = undefined;

    if (this.state === "complete") {
      icon = html`<sl-icon name="upload" class="text-success"></sl-icon>`;
      label = msg("Uploaded");
    } else if (this.state === "processing-upload") {
      icon = html`<sl-icon
        name="dot"
        library="app"
        class="animatePulse text-violet-600"
      ></sl-icon>`;
      label = msg("Processing Upload");
    } else if (this.state === "failed") {
      icon = html`<sl-icon
        name="x-octagon-fill"
        class="text-danger"
      ></sl-icon>`;
      label = msg("Failed");
    }

    return labelWithIcon({
      icon,
      label,
      hideLabel: this.hideLabel,
    });
  }
}
