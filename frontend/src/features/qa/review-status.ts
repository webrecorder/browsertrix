import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { ReviewStatus, type ArchivedItem } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

const iconFor = (status: Required<ArchivedItem["reviewStatus"]>) => {
  switch (status) {
    case ReviewStatus.Bad:
      return html`<sl-icon
        name="patch-exclamation-fill"
        class=${tw`text-danger-600`}
      ></sl-icon>`;
    case ReviewStatus.Poor:
      return html`<sl-icon
        name="patch-exclamation"
        class=${tw`text-danger-600`}
      ></sl-icon>`;
    case ReviewStatus.Fair:
      return html`<sl-icon
        name="patch-minus-fill"
        class=${tw`text-warning-600`}
      ></sl-icon>`;
    case ReviewStatus.Good:
      return html`<sl-icon
        name="patch-check"
        class=${tw`text-success-600`}
      ></sl-icon>`;
    case ReviewStatus.Excellent:
      return html`<sl-icon
        name="patch-check-fill"
        class=${tw`text-success-600`}
      ></sl-icon>`;
    default:
      return html`
        <sl-icon name="dash-circle" class=${tw`text-neutral-400`}></sl-icon>
      `;
  }
};

const labelFor = (severity: Required<ArchivedItem["reviewStatus"]>) => {
  switch (severity) {
    case ReviewStatus.Bad:
      return msg("Bad");
    case ReviewStatus.Poor:
      return msg("Poor");
    case ReviewStatus.Fair:
      return msg("Fair");
    case ReviewStatus.Good:
      return msg("Good");
    case ReviewStatus.Excellent:
      return msg("Excellent");
    default:
      return html`<span class=${tw`text-neutral-400`}>
        ${msg("No Review")}
      </span>`;
  }
};

@customElement("btrix-qa-review-status")
@localized()
export class QAReviewStatus extends TailwindElement {
  static styles = css`
    sl-icon {
      display: block;
      font-size: 1rem;
    }
  `;

  @property({ type: Number })
  status: ArchivedItem["reviewStatus"];

  render() {
    return html`
      <div class="flex items-center gap-2">
        ${iconFor(this.status)}
        <div>${labelFor(this.status)}</div>
      </div>
    `;
  }
}
