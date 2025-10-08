import { isEqual } from "lodash";

/**
 * Inverted version of lodash `isEqual` for use in Lit `@property`/`@state` configs for `hasChanged`.
 */
export const isNotEqual = (a: unknown, b: unknown) => !isEqual(a, b);
