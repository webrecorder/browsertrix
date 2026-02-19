import { msg } from "@lit/localize";
import { html } from "lit";

import type { StorageFile } from "@/types/storage";

function fileItem(file: StorageFile) {
  const fileName = file.name.slice(file.name.lastIndexOf("/") + 1);

  return html`<li class="flex items-center gap-x-2 whitespace-nowrap">
    <div class="flex flex-1 items-center gap-2 overflow-hidden px-2">
      <sl-icon
        name="file-earmark-zip-fill"
        class="size-4 shrink-0 text-neutral-600"
        label=${msg("File")}
      ></sl-icon>
      <btrix-link
        class="part-[base]:truncate"
        href=${file.path}
        title=${fileName}
        download=${fileName}
        hideIcon
      >
        ${fileName}
      </btrix-link>
    </div>
    <div>
      <sl-format-bytes
        class="text-neutral-600"
        value=${file.size}
      ></sl-format-bytes>
    </div>
    <div class="p-0.5">
      <sl-icon-button
        class="text-base"
        name="cloud-download"
        label=${msg("Download file")}
        title=${fileName}
        download=${fileName}
      ></sl-icon-button>
    </div>
  </li>`;
}

export function fileList({ files }: { files: StorageFile[] }) {
  return html`<ul class="divide-y rounded border">
    ${files.map(fileItem)}
  </ul>`;
}
