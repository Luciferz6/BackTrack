import { IterableContainer } from "./IterableContainer-JENOIFLG.cjs";

//#region src/internal/types/ReorderedArray.d.ts
type ReorderedArray<T extends IterableContainer> = { -readonly [P in keyof T]: T[number] };
//#endregion
export { ReorderedArray };
//# sourceMappingURL=ReorderedArray-CWhU1mkA.d.cts.map