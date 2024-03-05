/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { fake } from "sinon";
import { expect } from "@esm-bundle/chai";
// import { WeakRefMap, cached, innerCache } from "./weakCache";
import { memoize } from "proxy-memoize";
// describe("WeakRefMap", () => {
//   it("allows saving and retrieving from cache", () => {
//     const cache = new WeakRefMap<object, object>();
//     const objs = { key: { a: 1 }, value: { b: 2 } } as {
//       key: { a: 1 };
//       value?: { b: 2 };
//     };
//     cache.add(objs.key, objs.value!);
//     expect(cache.get(objs.key) === objs.value);
//     delete objs.value;
//     expect(cache.get(objs.key) === objs.value);
//   });
// });

describe("cached helper function", () => {
  it.only("caches the result of a long computation", () => {
    let b = 0;
    const expensiveCalculation = fake((obj: object) => ({
      ...obj,
      b: ++b,
    }));
    const cachedFn = memoize(expensiveCalculation);
    const key = { a: 1 };
    const res = [cachedFn(key), cachedFn(key), cachedFn(key)];
    console.log(res);
    expect(expensiveCalculation.callCount).to.equal(1);
  });
});
