import type SlAlert from "@shoelace-style/shoelace/dist/components/alert/alert.js";
import { html, render } from "lit";

import { type NotifyEventDetail } from "@/controllers/notify";

const toastsWithIds = new Map<string | number | symbol, SlAlert>();

export const toast = async (detail: NotifyEventDetail) => {
  const {
    title,
    message,
    variant = "primary",
    icon = "info-circle",
    duration = 5000,
    id,
  } = detail;

  if (id && toastsWithIds.has(id)) {
    const oldToast = toastsWithIds.get(id)!;
    await oldToast.hide();
  }
  const container = document.createElement("sl-alert");
  const alert = Object.assign(container, {
    variant,
    closable: true,
    duration: duration,
    style: [
      "--sl-panel-background-color: var(--sl-color-neutral-1000)",
      "--sl-color-neutral-700: var(--sl-color-neutral-0)",
      // "--sl-panel-border-width: 0px",
      "--sl-spacing-large: var(--sl-spacing-medium)",
    ].join(";"),
  });
  if (id) {
    toastsWithIds.set(id, container);
    container.addEventListener("sl-after-hide", () => {
      toastsWithIds.delete(id);
    });
  }
  render(
    html`
      <sl-icon name="${icon}" slot="icon"></sl-icon>
      ${title ? html`<strong>${title}</strong>` : ""}
      ${message ? html`<div>${message}</div>` : ""}
    `,
    container,
  );
  document.body.append(alert);
  await alert.toast();
};
