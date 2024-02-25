import { type TemplateResult, html } from "lit";

export const remainder = Symbol("remaining ungrouped data");

// type ColumnConfig<T extends object, C extends keyof T> = {
//   value: C;
//   label?: string;
//   priority?: number;
//   renderCell?: (
//     value: T,
//     column: C,
//     rowIndex: number,
//   ) => TemplateResult<1> | string;
// };

type GroupFunctionReturn = string | number | boolean;

type GroupFunction<T extends object> = (datum: T) => GroupFunctionReturn;

type GroupResolvable<
  T extends object,
  G extends keyof T,
  GR extends G | GroupFunction<T>,
> = GR extends (datum: T) => infer K ? (datum: T) => K : G;

type GroupKey<
  T extends object,
  G extends keyof T,
  GR extends G | GroupFunction<T>,
> = (GR extends (datum: T) => infer K ? K : T[G]) | typeof remainder;

type GroupConfig<
  T extends object,
  G extends keyof T,
  GR extends G | GroupFunction<T>,
> = {
  /** Value of the group in the source data */
  value: GroupKey<T, G, GR>;
  label?: string;
  collapsible?: boolean;
  startCollapsed?: boolean;
  renderLabel?: (group: {
    group: GroupConfig<T, G, GR> | null;
    data: T[];
  }) => TemplateResult<1> | string;
};

type Comparator<T> = (a: T, b: T) => number;

const defaultLabelRenderer = <
  T extends object,
  G extends keyof T,
  GR extends G | GroupFunction<T>,
>({
  group,
  data,
}: {
  group: GroupConfig<T, G, GR> | null;
  data: T[];
}) =>
  html`${group?.value === remainder ? "ungrouped" : group?.value}
  (${data.length})`;

export function DataTable<
  const T extends object,
  const G extends keyof T,
  const GR extends GroupResolvable<T, G, G | GroupFunction<T>>,
>({
  data,
  sortBy,
  groupBy,
  // columns,
  renderItem,
}: {
  data: T[];
  sortBy?: { by: keyof T; direction: "asc" | "desc" } | Comparator<T>;
  groupBy?: GR | { value: GR; groups?: GroupConfig<T, G, GR>[] };
  // columns?: false | { [k in keyof T]?: boolean | ColumnConfig<T, k> };
  renderItem?: (
    item: T,
    // columns: ColumnConfig<T, keyof T>[],
    index: number,
  ) => TemplateResult<1> | null;
}) {
  // Grouping

  let groups: null | { group: GroupConfig<T, G, GR> | null; data: T[] }[] =
    null;
  if (groupBy) {
    let groupKey: GR;
    if (typeof groupBy === "object") {
      groupKey = groupBy.value;
    } else {
      groupKey = groupBy;
    }

    const dataMap = new Map<GroupKey<T, G, GR>, T[]>();
    const configMap = new Map<GroupKey<T, G, GR>, GroupConfig<T, G, GR>>();

    // Ensure that defined group configs are ordered before the remainder group,
    // if it gets created
    if (typeof groupBy === "object" && groupBy.groups) {
      for (const groupConfig of groupBy.groups) {
        configMap.set(groupConfig.value, groupConfig);
      }
    }

    // If groups are explicitly listed, sort everything not in these into the
    // `remainder` group; otherwise, create whatever the groups we need
    const allowedKeys =
      typeof groupBy === "object"
        ? groupBy.groups?.map((group) => group.value)
        : undefined;

    // Iterate through data and sort it into groups
    for (const datum of data) {
      const resolvedKey = (
        typeof groupKey === "function"
          ? groupKey(datum)
          : datum[groupKey as unknown as G]
      ) as GroupKey<T, G, GR>;
      const shouldUseKey = allowedKeys?.includes(resolvedKey) ?? true;
      const key = shouldUseKey ? resolvedKey : remainder;

      if (!configMap.has(key)) {
        configMap.set(key, {
          // Defaults
          value: key,
          collapsible: false,
          renderLabel: defaultLabelRenderer,

          // Overrides from config
          ...(typeof groupBy === "object" &&
            groupBy.groups?.find((group) => group.value === key)),
        });
      }

      const dataForGroup = dataMap.get(key) ?? [];
      dataMap.set(key, [...dataForGroup, datum]);
    }

    groups = Array.from(configMap).map(([key, config]) => ({
      data: dataMap.get(key) ?? [],
      group: config,
    }));
  }

  // Sorting

  let sortFunction: Comparator<T> | null = null;

  if (sortBy) {
    if (typeof sortBy === "function") {
      sortFunction = sortBy;
    } else {
      // Default slightly-less-naïve-than-default sort function (does a
      // locale-aware comparison on the stringified values)
      sortFunction = (a: T, b: T) => {
        const [itemA, itemB] = [a[sortBy.by], b[sortBy.by]];
        let cmp = String(itemA).localeCompare(String(itemB));
        if (sortBy.direction === "desc") {
          cmp *= -1;
        }
        return cmp;
      };
    }
    if (groups) {
      for (const group of groups) {
        group.data.sort(sortFunction);
      }
    } else {
      data.sort(sortFunction);
    }
  }

  // Render

  return html`<sl-tree selection="leaf">
    ${groups
      ? groups.map(
          (group) =>
            html`<sl-tree-item expanded>
              ${group.group?.renderLabel?.(group) ??
              group.group?.label ??
              group.group?.value}
              ${group.data.map((datum, index) =>
                renderItem
                  ? html`<sl-tree-item class="is-leaf"
                      >${renderItem(datum, index)}</sl-tree-item
                    >`
                  : html`<sl-tree-item class="is-leaf"
                      >${JSON.stringify(datum)}</sl-tree-item
                    >`,
              )}
            </sl-tree-item>`,
        )
      : data.map((datum, index) =>
          renderItem
            ? html`<sl-tree-item class="is-leaf"
                >${renderItem(datum, index)}</sl-tree-item
              >`
            : html`<sl-tree-item class="is-leaf"
                >${JSON.stringify(datum)}</sl-tree-item
              >`,
        )}
  </sl-tree>`;
}
