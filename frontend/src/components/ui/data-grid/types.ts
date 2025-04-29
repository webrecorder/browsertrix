import type { TemplateResult } from "lit";
import { z } from "zod";

export type GridItem<T extends PropertyKey = string> = Record<
  T,
  string | number | null | undefined
>;

export enum GridColumnType {
  Text = "text",
  Number = "number",
  URL = "url",
  // Syntax = "syntax",
  Select = "select",
}

export type GridColumnSelectType = {
  inputType: GridColumnType.Select;
  renderSelectOptions: () => TemplateResult;
};

export type GridColumn<T = string> = {
  field: T;
  label: string | TemplateResult;
  description?: string;
  editable?: boolean;
  required?: boolean;
  inputPlaceholder?: string;
  width?: string;
  renderEditCell?: ({ item }: { item: GridItem }) => TemplateResult<1>;
  renderCell?: ({ item }: { item: GridItem }) => TemplateResult<1>;
} & (
  | {
      inputType?: GridColumnType;
    }
  | GridColumnSelectType
);

const rowIdSchema = z.string().nanoid();
export type GridRowId = z.infer<typeof rowIdSchema>;

export interface GridRows extends Map<GridRowId, GridItem> {}
