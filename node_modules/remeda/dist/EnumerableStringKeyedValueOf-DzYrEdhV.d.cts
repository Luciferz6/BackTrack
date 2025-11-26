import { IfNever } from "type-fest";

//#region src/internal/types/EnumerableStringKeyedValueOf.d.ts

/**
 * A union of all values of properties in T which are not keyed by a symbol,
 * following the definition of `Object.values` and `Object.entries`.
 */
type EnumerableStringKeyedValueOf<T> = T extends unknown ? IfNever<Exclude<keyof T, symbol>, never, Required<T>[Exclude<keyof T, symbol>]> : never;
//#endregion
export { EnumerableStringKeyedValueOf };
//# sourceMappingURL=EnumerableStringKeyedValueOf-DzYrEdhV.d.cts.map