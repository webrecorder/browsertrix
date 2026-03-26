import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const dedupeStatusText = (
  dependentsCount: number,
  dependenciesCount: number,
): string | undefined => {
  if (dependentsCount && dependenciesCount) {
    const number_of_dependent_items = localize.number(dependentsCount);
    const number_of_dependency_items = localize.number(dependenciesCount);

    const listFormatter = new Intl.ListFormat("en", {
      style: "long",
      type: "conjunction",
    });

    return listFormatter.format([
      pluralize(dependenciesCount, {
        zero: msg("This item depends on no items"),
        one: msg("This item depends on 1 item"),
        two: msg("This item depends on 2 items"),
        few: msg(str`This item depends on ${number_of_dependency_items} items`),
        many: msg(
          str`This item depends on ${number_of_dependency_items} items`,
        ),
        other: msg(
          str`This item depends on ${number_of_dependency_items} items`,
        ),
      }),
      pluralize(dependentsCount, {
        zero: msg("it is a dependency of 0 items."),
        one: msg("it is a dependency of 1 item."),
        two: msg("it is a dependency of 2 items."),
        few: msg(
          str`it is a dependency of ${number_of_dependent_items} items.`,
        ),
        many: msg(
          str`it is a dependency of ${number_of_dependent_items} items.`,
        ),
        other: msg(
          str`it is a dependency of ${number_of_dependent_items} items.`,
        ),
      }),
    ]);
  } else if (dependenciesCount) {
    const number_of_dependency_items = localize.number(dependenciesCount);

    return pluralize(dependenciesCount, {
      zero: msg("This item is dependent on no items"),
      one: msg("This item is dependent on 1 item"),
      two: msg("This item is dependent on 2 items"),
      few: msg(
        str`This item is dependent on ${number_of_dependency_items} items`,
      ),
      many: msg(
        str`This item is dependent on ${number_of_dependency_items} items`,
      ),
      other: msg(
        str`This item is dependent on ${number_of_dependency_items} items`,
      ),
    });
  } else if (dependentsCount) {
    const number_of_dependent_items = localize.number(dependentsCount);

    return pluralize(dependentsCount, {
      zero: msg("No items depend on this item"),
      one: msg("1 item depends on this item"),
      two: msg("2 items depend on this item"),
      few: msg(str`${number_of_dependent_items} items depend on this item`),
      many: msg(str`${number_of_dependent_items} items depend on this item`),
      other: msg(str`${number_of_dependent_items} items depend on this item`),
    });
  }
};
