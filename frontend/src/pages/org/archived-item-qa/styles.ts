import { css } from "lit";

import { TWO_COL_SCREEN_MIN_CSS } from "@/components/ui/tab-list";

export const styles = css`
  article {
    /* TODO calculate screen space instead of hardcoding */
    height: 100vh;
    grid-template:
      "mainHeader"
      "main"
      "pageListHeader"
      "pageList";
    grid-template-columns: 100%;
    grid-template-rows: repeat(4, max-content);
    min-height: 0;
  }

  article > * {
    min-height: 0;
  }

  @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
    article {
      grid-template:
        "mainHeader pageListHeader"
        "main pageList";
      grid-template-columns: 1fr 35rem;
      grid-template-rows: min-content 1fr;
    }
  }

  .mainHeader {
    grid-area: mainHeader;
  }

  .pageListHeader {
    grid-area: pageListHeader;
  }

  .main {
    grid-area: main;
  }

  .pageList {
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
