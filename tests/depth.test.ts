import { describe, expect, it } from 'vitest';
import './helpers';
import { ELEMENTS } from '../src/core/elements';

describe('FAR_ROCK', () => {
  it('is registered at id 32 and never counts for the scanner', () => {
    expect(ELEMENTS[32]?.name).toBe('far_rock');
    expect(ELEMENTS[32]?.solidForScan).toBe(false);
  });
});
