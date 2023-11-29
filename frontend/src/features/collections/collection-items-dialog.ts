import { LitElement, html, css } from "lit";
import { property, state, query, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import { APIController } from "@/controllers/api";
import type { AuthState } from "@/utils/AuthService";

/**
 * Manage archived items in a Collection via dialog.
 * ```ts
 * <btrix-collection-items-dialog
 * >
 * </btrix-collection-items-dialog>
 * ```
 */
@localized()
@customElement("btrix-collection-items-dialog")
export class CollectionItemsDialog extends LitElement {
  static styles = [
    css`
      btrix-dialog {
        --width: var(--btrix-screen-lg);
      }

      btrix-checkbox-list {
        --row-offset: 0;
      }

      .footerActions {
        display: flex;
        justify-content: space-between;
      }
    `,
  ];

  @property({ type: Object })
  authState!: AuthState;

  private api = new APIController(this);

  render() {
    return html`
      <btrix-dialog label=${msg("Select Archived items")} open>
        <btrix-details open>
          <span slot="title">${msg("Crawls in Collection")}</span>
          ${this.renderCrawlsInCollection()}
        </btrix-details>
        <btrix-details open>
          <span slot="title">${msg("Workflows")}</span>
          ${this.renderWorkflows()}
        </btrix-details>
        <div slot="footer" class="footerActions">
          <sl-button size="small" @click=${() => {}}
            >${msg("Cancel")}</sl-button
          >
          <sl-button size="small" variant="primary" @click=${this.save}
            >${msg("Save Selection")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  }

  private renderCrawlsInCollection() {
    return html`
      <btrix-checkbox-list>
        <btrix-checkbox-list-item>TODO</btrix-checkbox-list-item>
        <btrix-checkbox-list-item>TODO</btrix-checkbox-list-item>
        <btrix-checkbox-list-item>TODO</btrix-checkbox-list-item>
      </btrix-checkbox-list>
    `;
  }

  private renderWorkflows() {
    return html`
      <btrix-checkbox-list>
        <btrix-checkbox-list-item>TODO</btrix-checkbox-list-item>
        <btrix-checkbox-list-item>TODO</btrix-checkbox-list-item>
        <btrix-checkbox-list-item>TODO</btrix-checkbox-list-item>
      </btrix-checkbox-list>
    `;
  }

  private save = async () => {
    await this.updateComplete;
    console.log("save");
  };
}
