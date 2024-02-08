import { TailwindElement } from "@/classes/TailwindElement";
import { localized } from "@lit/localize";
import { type TemplateResult, html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

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

type GroupConfig<T extends object, G extends keyof T> = {
  value: G;
  label?: string;
  collapsible?: boolean;
  startCollapsed?: boolean;
  renderLabel?: (value: G, collapsed: boolean) => TemplateResult<1> | string;
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
  const G extends keyof T & string,
> extends TailwindElement {
  @property({ attribute: false })
  data: T[] = [];

  @property({ attribute: false })
  sort?: { by: keyof T; direction: "asc" | "desc" };

  @property({ attribute: false })
  group?: G | T[G][] | { value: G; groups: GroupConfig<T, G>[] };

  @property({ attribute: false })
  columns?: false | { [k in keyof T]?: boolean | ColumnConfig<T, k> };

  @property({ attribute: false })
  renderItem?: (
    item: T,
    columns: ColumnConfig<T, keyof T>[],
    index: number,
  ) => TemplateResult<1> | null;

  #groups: null | { group: GroupConfig<T, G> | null; data: T[] }[] = null;

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (
      changedProperties.has("data") ||
      changedProperties.has("sort") ||
      changedProperties.has("group")
    ) {
      this.recalculateData();
    }
  }

  private readonly recalculateData = () => {
    if (!this.group) {
      this.#groups = null;
      return;
    }
    let groupKey: G;
    if (typeof this.group === "string") {
      groupKey = this.group;
    } else if (Array.isArray(this.group)) {
      // TODO
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      groupKey = this.group.value;
    }
    // const d = Object.groupBy();
    // const groupMap = this.data.reduce(
    //   (entryMap, e) =>
    //     entryMap.set(e[groupKey], [...(entryMap.get(e[groupKey]) || []), e]),
    //   new Map<T[G], T[]>(),
    // );

    // const groups = typeof this.group === "string" ? ;
    // this.#groups = Array.from(
    //   this.data.reduce(
    //     (entryMap, e) =>
    //       entryMap.set(e[groupKey], {
    //         data: [...(entryMap.get(e.id) || []), e],
    //       }),
    //     new Map<T[G], T>(),
    //   ),
    // );
  };

  render() {
    return html``;
  }
}
