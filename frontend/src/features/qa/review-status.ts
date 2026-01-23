import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BadgeVariant } from "@/components/ui/badge";
import { ReviewStatus, type ArchivedItem } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

export const variantFor = (
  status: Required<ArchivedItem["reviewStatus"]>,
): BadgeVariant => {
  switch (status) {
    case ReviewStatus.Bad:
    case ReviewStatus.Poor:
      return "danger";
    case ReviewStatus.Fair:
      return "warning";
    case ReviewStatus.Good:
      return "success";
    case ReviewStatus.Excellent:
      return "success";
    default:
      return "neutral";
  }
};

export const iconFor = (
  status: Required<ArchivedItem["reviewStatus"]>,
  onDark = false,
) => {
  switch (status) {
    case ReviewStatus.Bad:
      return {
        name: "patch-exclamation-fill",
        class: onDark ? tw`text-danger-500` : tw`text-danger-600`,
      };
    case ReviewStatus.Poor:
      return {
        name: "patch-exclamation",
        class: onDark ? tw`text-danger-500` : tw`text-danger-600`,
      };
    case ReviewStatus.Fair:
      return {
        name: "patch-minus-fill",
        class: onDark ? tw`text-warning-500` : tw`text-warning-600`,
      };
    case ReviewStatus.Good:
      return {
        name: "patch-check",
        class: onDark ? tw`text-success-500` : tw`text-success-600`,
      };
    case ReviewStatus.Excellent:
      return {
        name: "patch-check-fill",
        class: onDark ? tw`text-success-500` : tw`text-success-600`,
      };
    default:
      return {
        name: "dash-circle",
        class: tw`text-neutral-400`,
      };
  }
};

export const labelFor = (severity: Required<ArchivedItem["reviewStatus"]>) => {
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
      return msg("No Review");
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

  @property({ type: Boolean })
  onDark = false;

  render() {
    const iconProps = iconFor(this.status, this.onDark);
    return html`
      <div class="flex items-center gap-2">
        <sl-icon name=${iconProps.name} class=${iconProps.class}></sl-icon>
        <div class=${clsx(!this.status && tw`text-neutral-400`)}>
          ${labelFor(this.status)}
        </div>
      </div>
    `;
  }
}
