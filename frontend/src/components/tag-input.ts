import { LitElement, html, css } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import inputCss from "@shoelace-style/shoelace/dist/components/input/input.styles.js";

export type TimeInputChangeEvent = CustomEvent<{
  hour: number;
  minute: number;
  period: "AM" | "PM";
}>;

/**
 * Usage:
 * ```ts
 * <btrix-time-input
 *   hour="1"
 *   minute="1"
 *   period="AM"
 *   @time-change=${console.log}
 * ></btrix-time-input>
 * ```
 *
 * @events
 */
@localized()
export class TagInput extends LitElement {
  static styles = css`
    :host {
      --sl-input-spacing-medium: var(--sl-spacing-x-small);
    }

    ${inputCss}

    .input__control {
      outline: 1px solid red;
      --sl-input-spacing-medium: var(--sl-spacing-small);
    }

    sl-tag {
      margin-left: var(--sl-spacing-2x-small);
      margin-top: 0.4rem;
    }
  `;

  @property({ type: Boolean })
  disabled = false;

  @state()
  tags: string[] = ["foo"];

  render() {
    return html`
      <div class="form-control">
        <label class="form-control__label" for="input">
          <slot name="label">${msg("Tags")}</slot>
        </label>
        <div class="input input--medium input--standard">
          ${this.renderTags()}
          <input
            id="input"
            class="input__control"
            @focus=${this.onFocus}
            @blur=${this.onBlur}
            @keydown=${this.onKeydown}
          />
        </div>
      </div>
    `;
  }

  private renderTags() {
    return this.tags.map(this.renderTag);
  }

  private renderTag = (content: string) => {
    const removeTag = () => {
      this.tags = this.tags.filter((v) => v !== content);
    };
    return html`
      <sl-tag
        size="small"
        variant="primary"
        pill
        removable
        @sl-remove=${removeTag}
        >${content}</sl-tag
      >
    `;
  };

  private onFocus(e: FocusEvent) {
    const el = e.target as HTMLInputElement;
    (el.parentElement as HTMLElement).classList.add("input--focused");
  }

  private async onBlur(e: FocusEvent) {
    const el = e.target as HTMLInputElement;
    (el.parentElement as HTMLElement).classList.remove("input--focused");

    if (el.value) {
      await this.updateComplete;
      this.tags = [
        ...this.tags,
        ...el.value
          .trim()
          .replace(/,/g, " ")
          .split(/\s+/g)
          .filter((v) => v && !this.tags.includes(v)),
      ];

      el.value = "";
    }
  }

  private async onKeydown(e: KeyboardEvent) {
    if (e.key === "," || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const el = e.target as HTMLInputElement;
      const value = el.value.trim().replace(/,/g, " ");
      if (!value) return;

      await this.updateComplete;
      this.tags = [...this.tags.filter((v) => v !== value), value];

      el.value = "";
    }
  }
}
