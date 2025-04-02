import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import { nanoid } from "nanoid";
import { z } from "zod";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  type CustomBehaviors,
  type CustomBehaviorSource,
  type CustomBehaviorsTableRow,
  type ChangeEventDetail as RowChangeEventDetail,
} from "@/features/crawl-workflows/custom-behaviors-table-row";
import { tw } from "@/utils/tailwind";

import "@/features/crawl-workflows/custom-behaviors-table-row";

type ChangeEventDetail = {
  value: CustomBehaviors;
};

const rowIdSchema = z.string().nanoid();
type RowId = z.infer<typeof rowIdSchema>;

/**
 * @fires btrix-change
 * @fires btrix-invalid
 */
@customElement("btrix-custom-behaviors-table")
@localized()
export class CustomBehaviorsTable extends BtrixElement {
  @property({ type: Array })
  customBehaviors: CustomBehaviors = [];

  @property({ type: Boolean })
  editable = false;

  @state()
  private rows = new Map<RowId, CustomBehaviorSource>();

  @queryAll("btrix-custom-behaviors-table-row")
  private readonly rowElems!: NodeListOf<CustomBehaviorsTableRow>;

  public get value(): CustomBehaviors {
    return [...this.rows.values()].filter((v) => v);
  }

  public get taskComplete() {
    return Promise.all([...this.rowElems].map(async (row) => row.taskComplete));
  }

  public checkValidity(): boolean {
    return ![...this.rowElems].some((row) => !row.checkValidity());
  }

  public reportValidity(): boolean {
    return ![...this.rowElems].some((row) => !row.reportValidity());
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("customBehaviors")) {
      if (!this.customBehaviors.length) {
        const id = nanoid();
        this.rows = new Map([[id, ""]]);
      } else {
        // TODO Reuse IDs?
        this.rows = new Map(this.customBehaviors.map((url) => [nanoid(), url]));
      }
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.get("rows")) {
      this.dispatchEvent(
        new CustomEvent<ChangeEventDetail>("btrix-change", {
          detail: {
            value: this.value,
          },
        }),
      );
    }
  }

  render() {
    return html`
      <btrix-table
        class=${clsx(
          tw`relative h-full w-full grid-cols-[max-content_1fr_min-content] rounded border`,
          // TODO Consolidate with data-table
          // https://github.com/webrecorder/browsertrix/issues/2497
          tw`[--btrix-cell-padding-bottom:var(--sl-spacing-x-small)] [--btrix-cell-padding-left:var(--sl-spacing-x-small)] [--btrix-cell-padding-right:var(--sl-spacing-x-small)] [--btrix-cell-padding-top:var(--sl-spacing-x-small)]`,
        )}
      >
        <btrix-table-head class="rounded-t bg-neutral-50">
          <btrix-table-header-cell> ${msg("Source")} </btrix-table-header-cell>
          <btrix-table-header-cell class="border-l">
            ${msg("Script Location")}
          </btrix-table-header-cell>
          ${when(
            this.editable,
            () => html`
              <btrix-table-header-cell class="border-l">
                <span class="sr-only">${msg("Row actions")}</span>
              </btrix-table-header-cell>
            `,
          )}
        </btrix-table-head>
        <btrix-table-body>
          ${repeat(
            this.rows,
            ([id]) => id,
            (args) => this.renderRow(...args),
          )}
        </btrix-table-body>
      </btrix-table>
      ${when(
        this.editable,
        () => html`
          <sl-button class="mt-2 w-full" @click=${() => this.addRow()}>
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            <span class="text-neutral-600">${msg("Add More")}</span>
          </sl-button>
        `,
      )}
    `;
  }

  private readonly renderRow = (id: RowId, url: CustomBehaviorSource) => {
    return html`
      <btrix-custom-behaviors-table-row
        behaviorSource=${url}
        ?editable=${this.editable}
        @btrix-remove=${() => this.removeRow(id)}
        @btrix-change=${(e: CustomEvent<RowChangeEventDetail>) => {
          const url = e.detail.value;

          this.rows = new Map(this.rows.set(id, url));
        }}
        @btrix-invalid=${() =>
          this.dispatchEvent(new CustomEvent("btrix-invalid"))}
      >
      </btrix-custom-behaviors-table-row>
    `;
  };

  private addRow() {
    const id = nanoid();

    this.rows = new Map(this.rows.set(id, ""));
  }

  private removeRow(id: RowId) {
    this.rows.delete(id);

    if (this.rows.size === 0) {
      this.addRow();
    } else {
      this.rows = new Map(this.rows);
    }
  }
}
