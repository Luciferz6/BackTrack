import { BoundedPartial } from "./BoundedPartial-BWnS4AxG.js";
import { EnumerableStringKeyOf } from "./EnumerableStringKeyOf-BROS2pTU.js";
import { EnumerableStringKeyedValueOf } from "./EnumerableStringKeyedValueOf-BBrO2cD5.js";

//#region src/mapKeys.d.ts

/**
 * Maps keys of `object` and keeps the same values.
 *
 * @param data - The object to map.
 * @param keyMapper - The mapping function.
 * @signature
 *    R.mapKeys(object, fn)
 * @example
 *    R.mapKeys({a: 1, b: 2}, (key, value) => key + value) // => { a1: 1, b2: 2 }
 * @dataFirst
 * @category Object
 */
declare function mapKeys<T extends {}, S extends PropertyKey>(data: T, keyMapper: (key: EnumerableStringKeyOf<T>, value: EnumerableStringKeyedValueOf<T>, data: T) => S): BoundedPartial<Record<S, EnumerableStringKeyedValueOf<T>>>;
/**
 * Maps keys of `object` and keeps the same values.
 *
 * @param keyMapper - The mapping function.
 * @signature
 *    R.mapKeys(fn)(object)
 * @example
 *    R.pipe({a: 1, b: 2}, R.mapKeys((key, value) => key + value)) // => { a1: 1, b2: 2 }
 * @dataLast
 * @category Object
 */
declare function mapKeys<T extends {}, S extends PropertyKey>(keyMapper: (key: EnumerableStringKeyOf<T>, value: EnumerableStringKeyedValueOf<T>, data: T) => S): (data: T) => BoundedPartial<Record<S, EnumerableStringKeyedValueOf<T>>>;
//#endregion
export { mapKeys };
//# sourceMappingURL=mapKeys-BPZ_ST4a.d.ts.map