import { clsx } from "clsx";
import { html } from "lit";

import type { Severity } from "./severity";

import { tw } from "@/utils/tailwind";
import { cached } from "@/utils/weakCache";

export type Approval = boolean | null;

export const iconFor = cached(
  (severity: Severity | Approval, classList?: string) => {
    const baseClasses = tw`h-4 w-4`;
    switch (severity) {
      // Severity
      case "severe":
        return html`<sl-icon
          name="exclamation-triangle-fill"
          class=${clsx("text-red-600", baseClasses, classList)}
        ></sl-icon>`;
      case "moderate":
        return html`<sl-icon
          name="dash-square-fill"
          class=${clsx("text-yellow-600", baseClasses, classList)}
        ></sl-icon>`;
      case "good":
        return html`<sl-icon
          name="check-circle-fill"
          class=${clsx("text-green-600", baseClasses, classList)}
        ></sl-icon>`;

      // Approval
      case true:
        return html`<sl-icon
          name="hand-thumbs-up-fill"
          class=${clsx("text-green-600", baseClasses, classList)}
        ></sl-icon>`;
      case false:
        return html`<sl-icon
          name="hand-thumbs-down-fill"
          class=${clsx("text-red-600", baseClasses, classList)}
        ></sl-icon>`;

      // No data
      default:
        return html`<sl-icon
          name="dash-circle"
          class=${clsx("text-gray-600", baseClasses, classList)}
        ></sl-icon>`;
    }
  },
);
