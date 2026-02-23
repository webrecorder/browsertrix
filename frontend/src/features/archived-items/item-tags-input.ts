import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import Fuse from "fuse.js";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { apiPathForTagType } from "@/components/ui/tag-filter/tag-filter";
import type {
  TagCount,
  TagCounts,
  TagType,
} from "@/components/ui/tag-filter/types";
import type { TagInputEvent, TagsChangeEvent } from "@/components/ui/tag-input";
import type { BtrixChangeEvent } from "@/events/btrix-change";

const MAX_SEARCH_RESULTS = 5;

export type BtrixTagsChangeEvent = BtrixChangeEvent<string[]>;

@customElement("btrix-item-tags-input")
@localized()
export class ItemTagsInput extends BtrixElement {
  @property({ type: String })
  tagType?: TagType;

  @property({ type: Array })
  tags?: string[];

  @state()
  private tagOptions: TagCount[] = [];

  private readonly fuse = new Fuse<TagCount>([], {
    keys: ["tag"],
  });

  private readonly orgTagsTask = new Task(this, {
    task: async ([tagType], { signal }) => {
      if (!tagType) {
        console.debug("no tagType");
        return;
      }

      let query = "";

      if (tagType === "workflow-crawl") {
        query = queryString.stringify({
          onlySuccessful: false,
        });
      }

      const { tags } = await this.api.fetch<TagCounts>(
        `/orgs/${this.orgId}/${apiPathForTagType[tagType]}/tagCounts${query && `?${query}`}`,
        { signal },
      );

      this.fuse.setCollection(tags);

      return tags;
    },
    args: () => [this.tagType] as const,
  });

  render() {
    return html` <btrix-tag-input
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

    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<BtrixTagsChangeEvent["detail"]>("btrix-tags-change", {
        detail: { value: tags },
      }),
    );
  };
}
