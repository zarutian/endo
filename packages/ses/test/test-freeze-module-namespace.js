// import '../index.js';
// import './lockdown-safe.js';
import test from 'ava';

import * as namespace from './module-namespace-const-1.js';

const { freeze, isFrozen, isExtensible, getOwnPropertyDescriptors } = Object;

test('freeze module-namespace-const-1', t => {
  t.is(isFrozen(namespace), false, 'not pre-frozen');
  t.is(isExtensible(namespace), false, 'is pre non-extensible');
  const preDescs = getOwnPropertyDescriptors(namespace);
  t.is(preDescs.one.writable, true, 'export const is unfortunately writable');
  t.is(preDescs.one.configurable, false, 'at least it is not configurable');
  t.throws(() => freeze(namespace), {
    message: /Cannot assign to read only property 'one' of object '\[object Module\]'/,
  });
  t.is(isFrozen(namespace), true, 'now it is frozen, really?');
  const postDescs = getOwnPropertyDescriptors(namespace);
  t.is(postDescs.one.writable, false, 'export const no longer writable');
  // console.log(JSON.stringify(postDescs));
});
