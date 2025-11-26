import { EventEmitter } from 'events';
export type BetEvent = {
    userId: string;
    type: 'created' | 'updated' | 'deleted';
    payload?: Record<string, any>;
};
declare class BetEventEmitter extends EventEmitter {
    emitEvent(event: BetEvent): void;
}
export declare const betEventBus: BetEventEmitter;
export declare const emitBetEvent: (event: BetEvent) => void;
export {};
//# sourceMappingURL=betEvents.d.ts.map