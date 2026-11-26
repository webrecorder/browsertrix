import { type UnknownRecord } from "type-fest";

import { type SearchParamsValue } from "@/controllers/searchParamsValue";

export type ObjectSearchParamsOptions<T> = {
  keys: (keyof T)[];
};

type SearchParamsObject = Record<string, string>;

/**
 * Generic object encoder and decoder for search params
 */
export function objectSearchParams<T extends SearchParamsObject>(
  opts: ObjectSearchParamsOptions<T>,
) {
  return [objectEncoder(opts), objectDecoder(opts)] as const;
}

export function objectEncoder<T extends SearchParamsObject>({
  keys,
}: ObjectSearchParamsOptions<T>): ConstructorParameters<
  typeof SearchParamsValue<T>
>[1] {
  return (value, params) => {
    keys.forEach((key) => {
      if (value[key]) {
        params.set(key as string, value[key] as string);
      } else {
        params.delete(key as string);
      }
    });
    return params;
  };
}

export function objectDecoder<T extends SearchParamsObject>({
  keys,
}: ObjectSearchParamsOptions<T>): ConstructorParameters<
  typeof SearchParamsValue<T>
>[2] {
  return (params) => {
    const values = {} as UnknownRecord;

    keys.forEach((key) => {
      const value = params.get(key as string);
      if (value !== null) values[key as string] = value;
    });

    return values as T;
  };
}
