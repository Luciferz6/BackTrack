import { EventEmitter } from 'events';

export type BetEvent = {
  userId: string;
  type: 'created' | 'updated' | 'deleted';
  payload?: Record<string, any>;
};

class BetEventEmitter extends EventEmitter {
  emitEvent(event: BetEvent) {
    this.emit('bet-event', event);
  }
}

export const betEventBus = new BetEventEmitter();
betEventBus.setMaxListeners(0);

export const emitBetEvent = (event: BetEvent) => {
  betEventBus.emitEvent(event);
};

