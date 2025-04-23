import type { SlInput } from "@shoelace-style/shoelace";
import type { TemplateResult } from "lit";
import { z } from "zod";

export type Item = Record<string, string | number | null | undefined>;

export type Column = {
  field: keyof Item; // TODO Infer from row?
  label: string | TemplateResult;
  inputType?: SlInput["type"];
  renderInput?: (item: Item) => string | TemplateResult;
  renderItem?: (item: Item) => string | TemplateResult;
};

const rowIdSchema = z.string().nanoid();
export type RowId = z.infer<typeof rowIdSchema>;

export interface Rows extends Map<RowId, Item> {}
