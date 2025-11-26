import { StrictFunction } from "./StrictFunction-CKTPcJaL.js";
import { NarrowedTo } from "./NarrowedTo-DcQJp20I.js";

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
//# sourceMappingURL=isFunction---ULtFiQ.d.ts.map