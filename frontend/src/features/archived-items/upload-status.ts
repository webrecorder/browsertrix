import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { labelWithIcon } from "@/layouts/labelWithIcon";

@customElement("btrix-upload-status")
@localized()
export class UploadStatus extends TailwindElement {
  // Currently, uploads are always complete
  @property({ type: String })
  state?: "complete" | AnyString;

  @property({ type: Boolean })
  hideLabel = false;

  render() {
    let icon = html`<sl-icon
      name="slash-circle"
      class="text-neutral-400"
    ></sl-icon>`;
    let label: string | undefined = undefined;

    if (this.state === "complete") {
      icon = html`<sl-icon name="upload" class="text-success"></sl-icon>`;
      label = msg("Uploaded");
    }

    return labelWithIcon({
      icon,
      label,
      hideLabel: this.hideLabel,
    });
  }
}
