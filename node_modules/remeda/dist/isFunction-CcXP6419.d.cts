import { StrictFunction } from "./StrictFunction-BdFYPw2p.cjs";
import { NarrowedTo } from "./NarrowedTo-DEGJVZVq.cjs";

//#region src/isFunction.d.ts

/**
 * A function that checks if the passed parameter is a Function and narrows its type accordingly.
 *
 * @param data - The variable to check.
 * @returns True if the passed input is a Function, false otherwise.
 * @signature
 *    R.isFunction(data)
 * @example
 *    R.isFunction(() => {}) //=> true
 *    R.isFunction('somethingElse') //=> false
 * @category Guard
 */
declare const isFunction: <T>(data: StrictFunction | T) => data is NarrowedTo<T, StrictFunction>;
//#endregion
export { isFunction };
//# sourceMappingURL=isFunction-CcXP6419.d.cts.map