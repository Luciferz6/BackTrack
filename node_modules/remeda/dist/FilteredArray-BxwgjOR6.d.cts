import { IterableContainer } from "./IterableContainer-JENOIFLG.cjs";
import { TupleParts } from "./TupleParts-BV9kUr1M.cjs";
import { CoercedArray } from "./CoercedArray-DlyU2XyU.cjs";

//#region src/internal/types/FilteredArray.d.ts
type FilteredArray<T extends IterableContainer, Condition> = T extends unknown ? [...FilteredFixedTuple<TupleParts<T>["required"], Condition>, ...FilteredFixedTuple<TupleParts<T>["optional"], Condition>, ...CoercedArray<SymmetricRefine<TupleParts<T>["item"], Condition>>, ...FilteredFixedTuple<TupleParts<T>["suffix"], Condition>] : never;
type FilteredFixedTuple<T, Condition, Output extends Array<unknown> = []> = T extends readonly [infer Head, ...infer Rest] ? FilteredFixedTuple<Rest, Condition, Head extends Condition ? [...Output, Head] : Head | Condition extends object ? Output : Condition extends Head ?
// But for any other type (mostly primitives), if the condition
Output | [...Output, Condition] : Output> : Output;
type SymmetricRefine<Item, Condition> = Item extends Condition ? Item : Condition extends Item ? Condition : never;
//#endregion
export { FilteredArray };
//# sourceMappingURL=FilteredArray-BxwgjOR6.d.cts.map