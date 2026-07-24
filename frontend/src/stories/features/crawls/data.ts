// eslint-disable import-x/no-unresolved -- Dev dependency
import { faker } from "@faker-js/faker";

// Fixed seed for reproducibility
faker.seed(0);

export const data = Array.from({ length: 95 }).map(
  () =>
    `${faker.internet.url({ appendSlash: true })}${
      // FIXME Replace workaround with `urlPath`
      // https://github.com/faker-js/faker/issues/3790
      faker.word.words({ count: { min: 0, max: 15 } }).replace(/\s/g, "/")
    }`,
);
