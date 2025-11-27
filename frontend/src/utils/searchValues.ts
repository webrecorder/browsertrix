export type SearchValues = {
  names: string[];
};

export type SearchField = "name";

/**
 * Convert API search values to a format compatible with Fuse collections
 */
export function toSearchItem<T = SearchField>(key: T) {
  return (value: string) => ({
    [key as string]: value,
  });
}
