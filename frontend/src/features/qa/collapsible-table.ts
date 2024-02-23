import { TailwindElement } from "@/classes/TailwindElement";
import { localized } from "@lit/localize";
import { type TemplateResult, html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

export const remainder = Symbol("remaining ungrouped data");

const defaultLabelRenderer = <T extends object, G extends keyof T>(
  group: GroupConfig<T, G>,
) => html`${group.value === remainder ? "ungrouped" : group.value}`;

type ColumnConfig<T extends object, C extends keyof T> = {
  value: C;
  label?: string;
  priority?: number;
  renderCell?: (
    value: T,
    column: C,
    rowIndex: number,
  ) => TemplateResult<1> | string;
};

type GroupKey<T extends object, G extends keyof T> = T[G] | typeof remainder;

type GroupConfig<T extends object, G extends keyof T> = {
  /** Value of the group in the source data */
  value: GroupKey<T, G>;
  label?: string;
  collapsible?: boolean;
  startCollapsed?: boolean;
  renderLabel?: (
    value: GroupConfig<T, G>,
    collapsed: boolean,
  ) => TemplateResult<1> | string;
};

// export type TableViewProps<T extends object, G extends keyof T> = {
//   data: T[];
//   sort?: { by: keyof T; direction: "asc" | "desc" };
//   group?:
//     | G[]
//     | GroupConfig<T, G>[]
//     | { value: G[] | GroupConfig<T, G>[]; collapsible?: boolean };
//   columns?: false | { [k in keyof T]?: boolean | ColumnConfig<T, k> };
//   renderItem?: (
//     item: T,
//     columns: ColumnConfig<T, keyof T>[],
//     index: number,
//   ) => TemplateResult<1> | null;
// };

@localized()
@customElement("btrix-data-driven-table")
export class DataDrivenTable<
  const T extends object,
  const G extends keyof T,
> extends TailwindElement {
  @property({ attribute: false })
  data: T[] = [];

  @property({ attribute: false })
  sort?: { by: keyof T; direction: "asc" | "desc" };

  @property({ attribute: false })
  group?: G | { value: G; groups?: GroupConfig<T, G>[] };

  @property({ attribute: false })
  columns?: false | { [k in keyof T]?: boolean | ColumnConfig<T, k> };

  @property({ attribute: false })
  renderItem?: (
    item: T,
    columns: ColumnConfig<T, keyof T>[],
    index: number,
  ) => TemplateResult<1> | null;

  #groups: null | { group: GroupConfig<T, G> | null; data: T[] }[] = null;
  // #columns: { [k in keyof T]?: boolean | ColumnConfig<T, k> };

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (
      changedProperties.has("data") ||
      changedProperties.has("sort") ||
      changedProperties.has("group")
    ) {
      console.log(changedProperties);
      this.recalculateData();
    }
  }

  private readonly recalculateData = () => {
    if (!this.group) {
      this.#groups = null;
      return;
    }
    let groupKey: G;
    if (typeof this.group === "object") {
      groupKey = this.group.value;
    } else {
      groupKey = this.group;
    }

    const dataMap = new Map<GroupKey<T, G>, T[]>();
    const configMap = new Map<GroupKey<T, G>, GroupConfig<T, G>>();

    // Ensure that defined group configs are ordered before the remainder group,
    // if it gets created
    if (typeof this.group === "object" && this.group.groups) {
      for (const groupConfig of this.group.groups) {
        configMap.set(groupConfig.value, groupConfig);
      }
    }

    // If groups are explicitly listed, sort everything not in these into the
    // `remainder` group; otherwise, create whatever the groups we need
    const allowedKeys =
      typeof this.group === "object"
        ? this.group.groups?.map((group) => group.value)
        : undefined;

    // Iterate through data and sort it into groups
    for (const datum of this.data) {
      const shouldUseKey = allowedKeys?.includes(datum[groupKey]) ?? true;
      const key = shouldUseKey ? datum[groupKey] : remainder;

      if (!configMap.has(key)) {
        configMap.set(key, {
          // Defaults
          value: key,
          collapsible: false,
          renderLabel: defaultLabelRenderer,

          // Overrides from config
          ...(typeof this.group === "object" &&
            this.group.groups?.find((group) => group.value === key)),
        });
      }

      const dataForGroup = dataMap.get(key) ?? [];
      dataMap.set(key, [...dataForGroup, datum]);
    }

    this.#groups = Array.from(configMap).map(([key, config]) => ({
      data: dataMap.get(key)!,
      group: config,
    }));
  };

  render() {
    if (this.#groups) {
      return html`${this.#groups.map(
        (group) =>
          html`<details>
            <summary>
              ${group.group?.renderLabel?.(group.group, false) ??
              group.group?.label ??
              group.group?.value}
            </summary>
            <ul>
              ${group.data.map(
                (datum, index) =>
                  this.renderItem?.(datum, [], index) ??
                  html`<li>${JSON.stringify(datum)}</li>`,
              )}
            </ul>
          </details>`,
      )}`;
    }
    return html``;
  }
}
