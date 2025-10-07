import isEqual from "lodash/fp/isEqual";

export const hasChanged = (a: unknown, b: unknown) => !isEqual(a, b);
