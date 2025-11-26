import { EventEmitter } from 'events';
class BetEventEmitter extends EventEmitter {
    emitEvent(event) {
        this.emit('bet-event', event);
    }
}
export const betEventBus = new BetEventEmitter();
betEventBus.setMaxListeners(0);
export const emitBetEvent = (event) => {
    betEventBus.emitEvent(event);
};
//# sourceMappingURL=betEvents.js.map