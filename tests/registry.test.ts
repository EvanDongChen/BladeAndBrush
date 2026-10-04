import { describe, expect, it } from 'vitest';
import { registerAbility } from '../src/core/abilities';
import { El, registerElement, rgba, type ElementDef } from '../src/core/elements';
import { registerFeature } from '../src/core/features';
import { registerGoal } from '../src/core/goals';
import { defaultParams, params, registerParam } from '../src/core/params';
import { registerLayer } from '../src/core/render';
import { registerMetric } from '../src/core/scan';
import './helpers';

const el = (id: number, name: string): ElementDef => ({
  id,
  name,
  kind: 'static',
  density: 1,
  flammability: 0,
  solidForScan: false,
  color: () => rgba(0, 0, 0),
});

describe('registries', () => {
  it('a duplicate element id throws', () => {
    expect(() => registerElement(el(El.WATER, 'otherWater'))).toThrow(/Duplicate element "3"/);
  });

  it('a duplicate element name throws', () => {
    expect(() => registerElement(el(200, 'rock'))).toThrow(/Duplicate element name "rock"/);
  });

  it('element ids must fit in a byte', () => {
    expect(() => registerElement(el(256, 'tooBig'))).toThrow(/0\.\.255/);
  });

  it('every other extension point rejects duplicates too', () => {
    const noop = () => {};
    expect(() => registerAbility({ id: 'paint', name: 'x', begin: noop, move: noop, end: noop })).toThrow(/Duplicate ability/);
    expect(() => registerFeature({ name: 'mountains', order: 0, run: noop })).toThrow(/Duplicate feature/);
    expect(() => registerMetric('trees', () => 0)).toThrow(/Duplicate metric/);
    expect(() => registerGoal('metric', () => ({ pass: true, progress: 1 }))).toThrow(/Duplicate goal/);
    expect(() => registerLayer({ name: 'cells', order: 0, kind: 'pixels', draw: noop })).toThrow(/Duplicate layer/);
    expect(() => registerParam({ key: 'gravity', label: 'g', min: 0, max: 1, step: 1, default: 0 })).toThrow(/Duplicate param/);
  });

  it('defaultParams() covers every registered param', () => {
    registerParam({ key: 'testOnlyParam', label: 'Test', min: 0, max: 10, step: 1, default: 3 });
    try {
      expect(defaultParams()).toMatchObject({ gravity: 2, testOnlyParam: 3 });
    } finally {
      params.unregister('testOnlyParam');
    }
  });
});
