import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlInput,
  SlInputEvent,
  SlSelectEvent,
} from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { emptyQuotas, LABELS } from "@/features/admin/org-quota-form";
import { fetchPlans, type Plan } from "@/features/admin/plans";
import type { APIUser } from "@/index";
import { RouteNamespace } from "@/routes";
import { ORG_NAME_MAX_LENGTH } from "@/types/org";
import { isApiError } from "@/utils/api";
import { maxLengthValidator } from "@/utils/form";
import type { OrgQuotas } from "@/utils/orgs";
import slugifyStrict from "@/utils/slugify";
import { AppStateService } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

const CUSTOM_PLAN_VALUE = "__custom__";

const PLAN_PREVIEW_KEYS: (keyof OrgQuotas)[] = [
  "maxConcurrentCrawls",
  "maxPagesPerCrawl",
  "maxExecMinutesPerMonth",
  "storageQuota",
];

/**
 * Dialog for creating a new organization.
 */
@customElement("btrix-new-org-dialog")
@localized()
export class NewOrgDialog extends BtrixElement {
  @property({ type: Boolean })
  open = false;

  @state()
  private orgName = "";

  @state()
  private selectedPlanId = "";

  @state()
  private customQuotas: OrgQuotas = emptyQuotas;

  @state()
  private isOrgNameValid: boolean | null = null;

  @state()
  private isSubmitting = false;

  @state()
  private slugPreview = "";

  private readonly validateOrgNameMax = maxLengthValidator(ORG_NAME_MAX_LENGTH);

  private get baseUrl() {
    return `${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
  }

  private readonly orgSlugsTask = new Task(this, {
    task: async () => {
      const data = await this.api.fetch<{ slugs: string[] }>("/orgs/slugs");
      return data.slugs;
    },
    args: () => [],
  });

  private readonly plansTask = new Task(this, {
    task: async () => fetchPlans(this.api),
    args: () => [],
  });

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("open") && this.open) {
      this.resetForm();
    }
  }

  render() {
    return html`<btrix-dialog
      .label=${msg("New Organization")}
      .open=${this.open}
      @sl-request-close=${this.onRequestClose}
      @sl-after-hide=${this.onAfterHide}
    >
      <form id="newOrgForm" class="grid gap-5" @submit=${this.onSubmit}>
        <div>
          <sl-input
            value=${this.orgName}
            class="with-max-help-text"
            name="name"
            label=${msg("Org Name")}
            placeholder=${msg("My Organization")}
            autocomplete="off"
            required
            help-text=${this.validateOrgNameMax.helpText}
            @sl-input=${this.onOrgNameInput}
          >
            ${this.renderOrgNameStatusIcon()}
          </sl-input>
          ${this.renderOrgUrlPreview()}
        </div>

        ${this.plansTask.render({
          pending: () => html`
            <div class="flex items-center gap-2 text-neutral-500">
              <sl-spinner></sl-spinner>
              ${msg("Loading plans...")}
            </div>
          `,
          complete: (plans) => this.renderPlanSelector(plans),
          error: () => html`
            <div class="text-danger-600">${msg("Failed to load plans.")}</div>
          `,
        })}
        ${this.renderPlanDetails()}
        ${this.selectedPlanId === CUSTOM_PLAN_VALUE
          ? html`
              <div>
                <h2 class="mb-3 text-lg font-medium">
                  ${msg("Custom Quotas")}
                </h2>
                <btrix-org-quota-form
                  .activeOrg=${null}
                  @btrix-change=${(e: CustomEvent<{ quotas: OrgQuotas }>) => {
                    this.customQuotas = e.detail.quotas;
                  }}
                ></btrix-org-quota-form>
              </div>
            `
          : ""}
      </form>

      <div slot="footer" class="flex justify-between">
        ${this.userInfo?.orgs.length
          ? html`<sl-button size="small" @click=${() => (this.open = false)}>
              ${msg("Cancel")}
            </sl-button>`
          : html`<span></span>`}

        <sl-button
          form="newOrgForm"
          variant="primary"
          type="submit"
          size="small"
          ?loading=${this.isSubmitting}
          ?disabled=${this.isSubmitting || !this.canSubmit}
        >
          ${msg("Create Org")}
        </sl-button>
      </div>
    </btrix-dialog>`;
  }

  private renderOrgUrlPreview() {
    return html`
      <div class="text-xs text-neutral-600">
        <span class="break-word text-blue-500">
          ${this.baseUrl}/${RouteNamespace.PrivateOrgs}/<strong
            class="font-medium"
            >${this.slugPreview ||
            html`<span class="text-neutral-400"
              >${slugifyStrict(msg("My Organization"))}</span
            >`}</strong
          >/dashboard
        </span>
      </div>
    `;
  }

  private renderOrgNameStatusIcon() {
    if (this.isOrgNameValid) {
      return html`
        <sl-tooltip
          slot="suffix"
          content=${msg("This org name is available")}
          hoist
        >
          <sl-icon class="mr-3 text-success" name="check-lg"></sl-icon>
        </sl-tooltip>
      `;
    }
    if (this.isOrgNameValid === false) {
      return html`
        <sl-tooltip
          slot="suffix"
          content=${msg("This org name is taken")}
          hoist
        >
          <sl-icon class="mr-3 text-danger" name="x-lg"></sl-icon>
        </sl-tooltip>
      `;
    }
    return html`
      <sl-tooltip
        slot="suffix"
        content=${msg("Start typing to see availability")}
        hoist
      >
        <sl-icon class="mr-3 text-neutral-300" name="check-lg"></sl-icon>
      </sl-tooltip>
    `;
  }

  private renderPlanSelector(plans: Plan[]) {
    if (plans.length === 0) {
      return;
    }

    return html`
      <div>
        <sl-select
          label=${msg("Plan")}
          required
          value=${this.selectedPlanId}
          @sl-change=${this.onPlanChange}
          hoist
        >
          <sl-option value="" disabled>${msg("Select a plan")}</sl-option>
          ${plans.map((plan) => {
            const summary = this.renderPlanOptionSummary(plan);
            return html`<sl-option
              value=${plan.id}
              class="part-[suffix]:flex-shrink"
            >
              ${plan.name}
              ${summary
                ? html`<span
                    slot="suffix"
                    class="ml-2 text-xs text-neutral-500"
                  >
                    ${summary}
                  </span>`
                : ""}
            </sl-option>`;
          })}
          <sl-option value=${CUSTOM_PLAN_VALUE}>${msg("Custom")}</sl-option>
        </sl-select>
      </div>
    `;
  }

  private renderPlanDetails() {
    const plans = this.plansTask.value;
    if (
      !plans ||
      plans.length === 0 ||
      !this.selectedPlanId ||
      this.selectedPlanId === CUSTOM_PLAN_VALUE
    ) {
      return;
    }

    const plan = plans.find((p) => p.id === this.selectedPlanId);
    if (!plan) return;

    return html`
      <div class="max-w-2xl rounded border p-3 text-sm">
        <h3 class="mb-2 font-medium">${plan.name} ${msg("quotas")}</h3>
        <table class="w-full">
          <tbody class="divide-y">
            ${(Object.keys(plan.org_quotas) as (keyof OrgQuotas)[]).map(
              (key) => html`
                <tr>
                  <td class="py-1 pr-4 text-neutral-600">
                    ${LABELS[key].label}
                  </td>
                  <td class="py-1 text-right font-medium">
                    ${this.formatQuota(plan.org_quotas[key], LABELS[key].type)}
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderPlanOptionSummary(plan: Plan) {
    const parts = PLAN_PREVIEW_KEYS.map((key) => {
      const value = plan.org_quotas[key];
      if (value <= 0) return null;
      return msg(
        str`${this.formatQuota(value, LABELS[key].type)} ${LABELS[key].label}`,
      );
    }).filter((part): part is string => part !== null);

    if (parts.length === 0) return;
    return parts.join(", ");
  }

  private formatQuota(v: number, type: "bytes" | "number") {
    const fn = type === "bytes" ? this.localize.bytes : this.localize.number;
    if (v <= 0) return msg("Unset");
    return fn(v);
  }

  private get canSubmit() {
    if (!this.isOrgNameValid) return false;
    const plans = this.plansTask.value;
    if (plans && plans.length > 0 && !this.selectedPlanId) {
      return false;
    }
    return true;
  }

  private onRequestClose(e: CustomEvent) {
    // Prevent closing if there are no orgs yet
    if (!this.userInfo?.orgs.length) {
      e.preventDefault();
    }
  }

  private onAfterHide() {
    this.resetForm();
    this.dispatchEvent(new CustomEvent("sl-after-hide", { bubbles: true }));
  }

  private resetForm() {
    this.orgName = "";
    this.selectedPlanId = "";
    this.customQuotas = emptyQuotas;
    this.isOrgNameValid = null;
    this.isSubmitting = false;
    this.slugPreview = "";
  }

  private async onOrgNameInput(e: SlInputEvent) {
    this.validateOrgNameMax.validate(e);

    const input = e.target as SlInput;
    const value = input.value;
    this.orgName = value;
    const slug = slugifyStrict(value);
    this.slugPreview = slug;
    const orgSlugs = this.orgSlugsTask.value ?? [];
    let isInvalid = !value;

    if (value) {
      if (!slug) {
        isInvalid = true;
        input.setCustomValidity(
          msg("Please include at least one letter or number."),
        );
      } else {
        isInvalid = orgSlugs.includes(slug);
        if (isInvalid) {
          input.setCustomValidity(msg("This org name is already taken."));
        }
      }
    }

    if (!isInvalid) {
      input.setCustomValidity("");
    }

    this.isOrgNameValid = !isInvalid;
  }

  private onPlanChange(e: SlSelectEvent) {
    this.selectedPlanId = (e.target as HTMLSelectElement).value;
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    if (!this.canSubmit) return;

    const formEl = e.target as HTMLFormElement;
    const formData = new FormData(formEl);
    const name = formData.get("name") as string;
    const slug = slugifyStrict(name);

    const body: {
      name: string;
      slug: string;
      planId?: string;
      quotas?: OrgQuotas;
    } = { name, slug };

    const plans = this.plansTask.value;
    if (plans && plans.length > 0) {
      if (this.selectedPlanId === CUSTOM_PLAN_VALUE) {
        body.quotas = this.customQuotas;
      } else {
        body.planId = this.selectedPlanId;
      }
    }

    this.isSubmitting = true;

    try {
      await this.api.fetch<{ added: true; id: string }>("/orgs/create", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const userInfo = await this.getUserInfo();
      AppStateService.updateUser(formatAPIUser(userInfo));

      this.notify.toast({
        message: html`
          ${msg(str`Created new org named "${name}".`)}
          <a
            class="underline hover:no-underline"
            href="/orgs/${slug}/dashboard"
            @click=${this.navigate.link.bind(this)}
          >
            ${msg(str`Log in to ${name}`)}
          </a>
        `,
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      this.dispatchEvent(
        new CustomEvent("btrix-success", { bubbles: true, composed: true }),
      );
      this.open = false;
    } catch (err) {
      let message = msg("Sorry, couldn't create organization at this time.");

      if (isApiError(err)) {
        if (err.details === "duplicate_org_name") {
          message = msg("This org name is already taken, try another one.");
        } else if (err.details === "duplicate_org_slug") {
          message = msg(
            "This org URL identifier is already taken, try another one.",
          );
        } else if (err.details === "invalid_slug") {
          message = msg(
            "This org URL identifier is invalid. Please use alphanumeric characters and dashes (-) only.",
          );
        } else if (err.details === "invalid_plan") {
          message = msg("Selected plan is not available.");
        }
      }

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "org-invalid",
      });
    }

    this.isSubmitting = false;
  }

  async getUserInfo(): Promise<APIUser> {
    return this.api.fetch("/users/me");
  }
}
