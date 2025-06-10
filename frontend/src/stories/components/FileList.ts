import { html } from "lit";

import "@/components/ui/file-list";

// import type { FileList } from "@/components/ui/file-list";

export type RenderProps = { files: File[] };

export const renderComponent = ({ files }: Partial<RenderProps>) => {
  return html`
    <btrix-file-list>
      ${files?.map(
        (file) => html`
          <btrix-file-list-item .file=${file}></btrix-file-list-item>
        `,
      )}
    </btrix-file-list>
  `;
};
