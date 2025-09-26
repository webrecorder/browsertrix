import type { TemplateResult } from "lit";
import { z } from "zod";

export type GridItem<T extends PropertyKey = string> = Record<
  T,
  string | number | null | undefined
>;

export type GridItemValue<T extends PropertyKey = string> =
  GridItem<T>[keyof GridItem<T>];

export enum GridColumnType {
  Text = "text",
  Number = "number",
  URL = "url",
  // Syntax = "syntax",
  Select = "select",
}

export type GridColumnSelectType = {
  inputType: GridColumnType.Select;
  selectOptions: {
    value: string;
    label?: string | TemplateResult;
  }[];
};

export type GridColumnNumberType<Item = GridItem> = {
  inputType: GridColumnType.Number;
  min?: number | ((item: Item | undefined) => number | undefined);
  max?: number | ((item: Item | undefined) => number | undefined);
  step?: number | ((item: Item | undefined) => number | undefined);
};

export type GridColumn<
  Item = GridItem,
  Key extends keyof Item = keyof Item,
  InputType extends GridColumnType = GridColumnType,
> = {
  field: Key;
  label: string | TemplateResult;
  description?: string;
  editable?: boolean | ((item: Item | undefined) => boolean | undefined);
  required?: boolean;
  inputPlaceholder?: string;
  width?: string;
  align?: "start" | "center" | "end";
  renderEditCell?: (props: {
    item: Item;
    value?: Item[keyof Item];
  }) => TemplateResult<1>;
  renderCell?: (props: { item: Item }) => string | TemplateResult<1>;
  renderCellTooltip?: (props: { item: Item }) => string | TemplateResult<1>;
  inputType?: InputType;
} & (
  | {
      inputType?: GridColumnType;
    }
  | GridColumnSelectType
  | GridColumnNumberType<Item>
);

const rowIdSchema = z.string().nanoid();
export type GridRowId = z.infer<typeof rowIdSchema>;

export interface GridRows<T> extends Map<GridRowId, T> {}
