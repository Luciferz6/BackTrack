import { IterableContainer } from "./IterableContainer-B2PfkIAC.js";

//#region src/internal/types/ReorderedArray.d.ts
type ReorderedArray<T extends IterableContainer> = { -readonly [P in keyof T]: T[number] };
//#endregion
export { ReorderedArray };
//# sourceMappingURL=ReorderedArray-D1j71ZsD.d.ts.map