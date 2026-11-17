import { createComponent, Types } from '@iwsdk/core';

/** A thought you can pinch out of the air and file into a jar. */
export const Mote = createComponent('Mote', {
  slot: { type: Types.Int8, default: 0, label: 'Thought slot' },
});

/** A pinchable control (ember, "that's enough", moon). */
export const LullButton = createComponent('LullButton', {
  action: { type: Types.String, default: '', label: 'Action id' },
});
