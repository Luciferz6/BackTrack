import { IterableContainer } from "./IterableContainer-JENOIFLG.cjs";
import { RemedaTypeError } from "./RemedaTypeError-DXpBzNhN.cjs";
import { TupleParts } from "./TupleParts-BV9kUr1M.cjs";
import { ClampedIntegerSubtract } from "./ClampedIntegerSubtract-Ca6NWX6v.cjs";
import { CoercedArray } from "./CoercedArray-DlyU2XyU.cjs";
import { And, GreaterThan, IsEqual, IsLiteral, IsNever, ReadonlyTuple } from "type-fest";

//#region src/internal/types/ArrayRequiredPrefix.d.ts
type ArrayRequiredPrefix<T extends IterableContainer, N extends number> = IsLiteral<N> extends true ? T extends unknown ? ClampedIntegerSubtract<N, [...TupleParts<T>["required"], ...TupleParts<T>["suffix"]]["length"]> extends infer Remainder extends number ? Remainder extends 0 ? T : And<GreaterThan<Remainder, TupleParts<T>["optional"]["length"]>, IsNever<TupleParts<T>["item"]>> extends true ? RemedaTypeError<"ArrayRequiredPrefix", "The input tuple cannot satisfy the minimum", {
  type: never;
  metadata: [T, N];
}> : WithSameReadonly<T, [...TupleParts<T>["required"], ...OptionalTupleRequiredPrefix<TupleParts<T>["optional"], Remainder>, ...ReadonlyTuple<TupleParts<T>["item"], ClampedIntegerSubtract<Remainder, TupleParts<T>["optional"]["length"]>>, ...CoercedArray<TupleParts<T>["item"]>, ...TupleParts<T>["suffix"]]> : RemedaTypeError<"ArrayRequiredPrefix", "Remainder didn't compute to a number?!", {
  type: never;
  metadata: [T, N];
}> : RemedaTypeError<"ArrayRequiredPrefix", "Failed to distribute union?!", {
  type: never;
  metadata: T;
}> : RemedaTypeError<"ArrayRequiredPrefix", "Only literal minimums are supported!", {
  type: never;
  metadata: N;
}>;
type WithSameReadonly<Source, Destination> = IsEqual<Source, Readonly<Source>> extends true ? Readonly<Destination> : Destination;
type OptionalTupleRequiredPrefix<T extends Array<unknown>, N, Prefix extends Array<unknown> = []> = Prefix["length"] extends N ? [...Prefix, ...Partial<T>] : T extends readonly [infer Head, ...infer Rest] ? OptionalTupleRequiredPrefix<Rest, N, [...Prefix, Head]> : Prefix;
//#endregion
export { ArrayRequiredPrefix };
//# sourceMappingURL=ArrayRequiredPrefix-64UMblqq.d.cts.map