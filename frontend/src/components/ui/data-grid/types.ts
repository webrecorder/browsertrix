import type { TemplateResult } from "lit";
import { z } from "zod";

export type GridItem = Record<string, string | number | null | undefined>;

export enum GridColumnType {
  Text = "text",
  Number = "number",
  URL = "url",
  // Code = "code", // TODO
  Select = "select",
}

export type GridColumnSelectType = {
  inputType: GridColumnType.Select;
  renderSelectOptions: () => TemplateResult;
};

export type GridColumn = {
  field: keyof GridItem; // TODO Infer from row?
  label: string | TemplateResult;
  description?: string;
  editable?: boolean;
  inputPlaceholder?: string;
  renderEditCell?: ({ item }: { item: GridItem }) => string | TemplateResult;
  renderCell?: ({ item }: { item: GridItem }) => string | TemplateResult;
} & (
  | {
      inputType?: GridColumnType;
    }
  | GridColumnSelectType
);

const rowIdSchema = z.string().nanoid();
export type GridRowId = z.infer<typeof rowIdSchema>;

export interface GridRows extends Map<GridRowId, GridItem> {}
