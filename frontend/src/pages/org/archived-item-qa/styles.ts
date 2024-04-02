import { css } from "lit";

import { TWO_COL_SCREEN_MIN_CSS } from "@/components/ui/tab-list";

export const styles = css`
  article > * {
    min-height: 0;
  }

  .grid {
    grid-template:
      "header"
      "pageToolbar"
      "tabNav"
      "tabGroup"
      "pageList";
    grid-template-columns: 100%;
    grid-template-rows: repeat(5, max-content);
  }

  @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
    .grid {
      /* TODO calculate screen space instead of hardcoding */
      height: 100vh;
      /* overflow: hidden; */
      grid-template:
        "header header"
        "pageToolbar pageList"
        "tabGroup pageList";
      grid-template-columns: 1fr 35rem;
      grid-template-rows: repeat(2, min-content) 1fr;
    }
  }

  .grid--header {
    grid-area: header;
  }

  .grid--pageToolbar {
    grid-area: pageToolbar;
  }

  .grid--tabGroup {
    grid-area: tabGroup;
  }

  .grid--pageList {
    grid-area: pageList;
  }

  sl-image-comparer::part(divider) {
    background-color: yellow;
    /* mix-blend-mode: difference; */
  }

  sl-image-comparer::part(handle) {
    background-color: red;
  }
`;
