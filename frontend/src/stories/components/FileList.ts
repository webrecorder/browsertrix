import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import "@/components/ui/file-list";

import type { FileListItem } from "@/components/ui/file-list/file-list-item";

export type RenderProps = { items: Partial<FileListItem>[] };

export const renderComponent = ({ items }: Partial<RenderProps>) => {
  return html`
    <btrix-file-list @btrix-remove=${console.log}>
      ${items?.map(
        (item) => html`
          <btrix-file-list-item
            .file=${item.file}
            name=${ifDefined(item.name)}
            size=${ifDefined(item.size)}
            href=${ifDefined(item.href)}
          ></btrix-file-list-item>
        `,
      )}
    </btrix-file-list>
  `;
};
