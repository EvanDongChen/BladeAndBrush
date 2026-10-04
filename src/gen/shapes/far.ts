import { mountainProfile } from './profile';
import { registerShape } from './registry';

/** A distant ridge: smooth and rolling whatever the ruggedness, with few inner layers. */
registerShape({ name: 'far', build: (p, ctx) => mountainProfile(p, ctx, { maxRugged: 2, layers: 2 }) });
