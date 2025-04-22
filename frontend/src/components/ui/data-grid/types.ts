import type { TemplateResult } from "lit";
import { z } from "zod";

export type Item = Record<string, unknown>;

export type Column = {
  field: keyof Item; // TODO Infer from row?
  label: string | TemplateResult;
};

const rowIdSchema = z.string().nanoid();
type RowId = z.infer<typeof rowIdSchema>;

export interface Rows extends Map<RowId, Item> {}
