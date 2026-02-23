import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import Fuse from "fuse.js";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { TagCount, TagCounts } from "@/components/ui/tag-filter/types";
import type { TagInputEvent, TagsChangeEvent } from "@/components/ui/tag-input";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { FormControl } from "@/mixins/FormControl";

const MAX_SEARCH_RESULTS = 10;

export type BtrixTagsChangeEvent = BtrixChangeEvent<string[]>;

@customElement("btrix-item-tags-input")
@localized()
export class ItemTagsInput extends FormControl(BtrixElement) {
  @property({ type: String })
  name = "tags";

  @property({ type: Array })
  tags?: string[];

  @state()
  private tagOptions: TagCount[] = [];

  private readonly fuse = new Fuse<TagCount>([], {
    keys: ["tag"],
    threshold: 0.3, // stricter; default is 0.6
    shouldSort: false,
  });

  private readonly orgTagsTask = new Task(this, {
    task: async (_args, { signal }) => {
      const { tags } = await this.api.fetch<TagCounts>(
        `/orgs/${this.orgId}/crawlconfigs/tagCounts`,
        { signal },
      );
      this.fuse.setCollection(tags);

      return tags;
    },
    args: () => [] as const,
  });

  render() {
    return html`<btrix-tag-input
      .initialTags=${this.tags}
      .tagOptions=${this.tagOptions}
      @tag-input=${this.onTagInput}
      @tags-change=${this.onTagsChange}
    ></btrix-tag-input>`;
  }

  private readonly onTagInput = (e: TagInputEvent) => {
    const { value } = e.detail;
    if (!value) return;
    this.tagOptions = this.fuse
      .search(value, { limit: MAX_SEARCH_RESULTS })
      .map(({ item }) => item);
  };

  private readonly onTagsChange = async (e: TagsChangeEvent) => {
    const { tags } = e.detail;

    const formData = new FormData();

    tags.forEach((tag) => formData.append(this.name, tag));

    this.setFormValue(formData);

    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<BtrixTagsChangeEvent["detail"]>("btrix-tags-change", {
        detail: { value: tags },
      }),
    );
  };
}
