import { mountainProfile } from './profile';
import { registerShape } from './registry';

/** A pointed mountain: the default shan-shui peak. */
registerShape({ name: 'peak', build: (p, ctx) => mountainProfile(p, ctx) });
