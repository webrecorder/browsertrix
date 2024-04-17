import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";

import { ReviewStatus, type ArchivedItem } from "@/types/crawler";

export const iconFor = (status: ArchivedItem["reviewStatus"]) => {
  switch (status) {
    case ReviewStatus.Bad:
    case ReviewStatus.Poor:
      return html`<sl-icon
        name="patch-exclamation-fill"
        class="text-danger-600"
      ></sl-icon>`;
    case ReviewStatus.Fair:
      return html`<sl-icon
        name="patch-minus"
        class="text-success-600"
      ></sl-icon>`;
    case ReviewStatus.Good:
    case ReviewStatus.Excellent:
      return html`<sl-icon
        name="patch-check-fill"
        class="text-success-600"
      ></sl-icon>`;

    default:
      return;
  }
};

export const labelFor = (
  severity: ArchivedItem["reviewStatus"],
): string | void => {
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
      return;
  }
};

export const statusWithIcon = (
  icon: TemplateResult<1>,
  label: string | TemplateResult<1>,
) => html`
  <div class="flex items-center gap-2">
    <span class="inline-flex text-base">${icon}</span>${label}
  </div>
`;
