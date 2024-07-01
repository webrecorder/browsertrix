import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { columns } from "../ui/columns";

import { TailwindElement } from "@/classes/TailwindElement";
import type { OrgData } from "@/types/org";
import { formatNumber } from "@/utils/localization";

@localized()
@customElement("btrix-org-settings-billing")
export class OrgSettingsBilling extends TailwindElement {
  static styles = css`
    .form-label {
      font-size: var(--sl-input-label-font-size-small);
    }
  `;

  @property({ type: Object })
  quotas?: OrgData["quotas"];

  render() {
    console.log(this.quotas);
    return html`
      <div class="rounded-lg border">
        ${columns([
          [
            html`
              <h4 class="form-label text-neutral-800">
                ${msg("Current Plan")}
              </h4>
              <btrix-card>
                <div slot="title" class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <sl-icon class="text-success" name="check-circle"></sl-icon>
                    ${msg("Active")}
                  </div>
                  <a
                    class="transition-color flex items-center gap-2 px-2 py-1 text-sm leading-none text-primary hover:text-primary-500"
                    href="#"
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    ${msg("Manage Plan")}
                    <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                  </a>
                </div>
                ${when(
                  this.quotas,
                  (quotas) => html`
                    <dl>
                      <div>
                        <dt>${msg("")}</dt>
                        <dd>${formatNumber(quotas.extraExecMinutes)}</dd>
                      </div>
                    </dl>
                  `,
                )}
              </btrix-card>
            `,
            html`
              <p class="mb-3">
                ${msg(
                  "Hosted plan status, quotas, and add-ons, if applicable.",
                )}
              </p>
              <p class="leading-normal">
                ${msg(
                  "You can view plan details, update payment methods, and update billing information by clicking “Manage Plan”. This will redirect you to our payment processor in a new tab.",
                )}
              </p>
            `,
          ],
        ])}
      </div>
    `;
  }
}
