import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import type { SlInput, SlTextarea } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { Profile } from "@/types/crawler";
import { isApiError } from "@/utils/api";
import { maxLengthValidator } from "@/utils/form";

export type ProfileUpdatedEvent = CustomEvent<{
  name: Profile["name"];
  description: Profile["description"];
}>;

/**
 * @fires btrix-updated
 */
@customElement("btrix-profile-metadata-dialog")
@localized()
export class ProfileMetadataDialog extends BtrixElement {
  @property({ type: Object })
  profile?: Profile;

  @property({ type: Boolean })
  open = false;

  @property({ type: String })
  autofocusOn?: "name" | "description";

  @state()
  private isDialogVisible = false;

  @query("btrix-dialog")
  private readonly dialog?: Dialog | null;

  @query("form")
  private readonly form?: HTMLFormElement | null;

  @query(`sl-input[name="name"]`)
  private readonly nameInput?: SlInput | null;

  @query(`sl-textarea[name="description"]`)
  private readonly descriptionInput?: SlTextarea | null;

  private readonly validateNameMax = maxLengthValidator(50);
  private readonly validateDescriptionMax = maxLengthValidator(500);

  private readonly submitTask = new Task(this, {
    autoRun: false,
    task: async ([profile], { signal }) => {
      if (!this.form || !profile) {
        console.debug("no form or profile", this.form, profile);
        return;
      }

      const params = serialize(this.form) as {
        name: string;
        description: string;
      };

      try {
        await this.api.fetch<{ updated: boolean }>(
          `/orgs/${this.orgId}/profiles/${profile.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(params),
            signal,
          },
        );

        this.dispatchEvent(
          new CustomEvent<ProfileUpdatedEvent["detail"]>("btrix-updated", {
            detail: params,
          }),
        );

        this.notify.toast({
          message: msg("Updated browser profile metadata."),
          variant: "success",
          icon: "check2-circle",
          id: "browser-profile-save-status",
        });
      } catch (e) {
        let message = msg("Sorry, couldn't save browser profile at this time.");

        if (isApiError(e) && e.statusCode === 403) {
          if (e.details === "storage_quota_reached") {
            message = msg(
              "Your org does not have enough storage to save this browser profile.",
            );
          } else {
            message = msg(
              "You do not have permission to edit browser profiles.",
            );
          }
        }

        this.notify.toast({
          message: message,
          variant: "danger",
          icon: "exclamation-octagon",
          id: "browser-profile-save-status",
        });
      }
    },
    args: () => [this.profile] as const,
  });

  render() {
    return html`<btrix-dialog
      .label=${msg("Edit Metadata")}
      .open=${this.open}
      @sl-show=${() => (this.isDialogVisible = true)}
      @sl-initial-focus=${async () => {
        await this.updateComplete;

        switch (this.autofocusOn) {
          case "name":
            this.nameInput?.focus();
            break;
          case "description":
            this.descriptionInput?.focus();
            break;
          default:
            break;
        }
      }}
      @sl-after-hide=${() => (this.isDialogVisible = false)}
      >${this.isDialogVisible ? this.renderForm() : ""}
    </btrix-dialog>`;
  }

  private renderForm() {
    if (!this.profile) return;

    const submitting = this.submitTask.status === TaskStatus.PENDING;

    return html`
      <form
        id="crawlDetailsForm"
        @submit=${(e: SubmitEvent) => {
          e.preventDefault();

          if (this.form?.checkValidity()) {
            void this.submitTask.run();
          }
        }}
        @reset=${() => void this.dialog?.hide()}
      >
        <sl-input
          name="name"
          class="with-max-help-text"
          label=${msg("Name")}
          autocomplete="off"
          value=${this.profile.name}
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
          required
        ></sl-input>

        <sl-textarea
          name="description"
          class="with-max-help-text"
          label=${msg("Description")}
          value=${this.profile.description || ""}
          rows="3"
          autocomplete="off"
          resize="auto"
          help-text=${this.validateDescriptionMax.helpText}
          @sl-input=${this.validateDescriptionMax.validate}
        ></sl-textarea>

        ${
          // <btrix-tag-input
          // name="tags"
          // .initialTags=${[]}
          // .tagOptions=${[]}
          // @tag-input=${console.log}
          // @tags-change=${console.log}
          // ></btrix-tag-input>
          undefined
        }
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button form="crawlDetailsForm" type="reset" size="small"
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          form="crawlDetailsForm"
          variant="primary"
          type="submit"
          size="small"
          ?loading=${submitting}
          ?disabled=${submitting}
          >${msg("Save")}</sl-button
        >
      </div>
    `;
  }
}
