import { LocalizeController as SlLocalizeController } from "@shoelace-style/localize";

import localize from "@/utils/localize";

export class LocalizeController extends SlLocalizeController {
  /**
   * Custom number formatter that uses ordinals
   */
  readonly number = localize.number;

  /**
   * Custom date formatter that takes missing `Z` into account
   */
  readonly date = localize.date;
}
