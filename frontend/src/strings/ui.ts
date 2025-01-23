import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";

export const noData = "--";
export const notApplicable = msg("n/a");

// TODO Refactor all generic confirmation messages to use utility
export const deleteConfirmation = (name: string | TemplateResult) =>
  msg(html`
    Are you sure you want to delete
    <strong class="font-semibold">${name}</strong>?
  `);
