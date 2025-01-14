import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";

// TODO Refactor all generic confirmation messages to use utility
export const deleteConfirmation = (name: string | TemplateResult) =>
  msg(html`
    Are you sure you want to delete
    <strong class="font-semibold">${name}</strong>?
  `);
