// @ts-check
/* eslint-disable no-await-in-loop */

import '@endo/init/debug.js';

import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';
import { makePromiseKit } from '@endo/promise-kit';
import { makeUpdateTopic } from '../index.js';

const test = wrapTest(rawTest);

test('update topic supports parallel subscriptions', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeUpdateTopic();
  const publisher = publish();

  // Coordinated checkpoints.
  const [p1, p2, s1, s2, s3] = (function* generatePromiseKits() {
    for (;;) yield makePromiseKit();
  })();

  await Promise.all([
    (async () => {
      await s1.promise;
      await publisher.next(1);
      p1.resolve();

      await Promise.all([s2.promise, s3.promise]);
      await publisher.next(2);
      p2.resolve();

      await publisher.return('EOL');
    })(),

    // Subscribe before first publish.
    (async () => {
      const subscription = subscribe();
      s1.resolve();

      let expected = 1;
      for await (const actual of subscription) {
        t.is(actual, expected);
        expected += 1;
      }
      t.is(expected, 3);
    })(),

    // Subscribe after first publish.
    (async () => {
      await p1.promise;
      const subscription = subscribe();
      s2.resolve();

      let expected = 1;
      for await (const actual of subscription) {
        t.is(actual, expected);
        expected += 1;
      }
      t.is(expected, 3);
    })(),

    // Parallel subscriber.
    (async () => {
      await p1.promise;
      const subscription = subscribe();
      s3.resolve();

      let expected = 1;
      for await (const actual of subscription) {
        t.is(actual, expected);
        expected += 1;
      }
      t.is(expected, 3);
    })(),
  ]);

  t.pass();
});

test('update topic shows last published value to new subscriber', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeUpdateTopic();

  // Coordinated checkpoints.
  const [p1, p2, s1a, s2a] = (function* generatePromiseKits() {
    for (;;) yield makePromiseKit();
  })();

  await Promise.all([
    (async () => {
      const publisher = publish();
      await publisher.next(1);
      p1.resolve();

      await Promise.all([s1a.promise, s2a.promise]);
      await publisher.next(2);
      p2.resolve();
    })(),

    (async () => {
      await p1.promise;
      const subscription = subscribe();
      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 1);
      }
      s1a.resolve();

      await p2.promise;
      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 2);
      }
    })(),

    (async () => {
      await p1.promise;
      const subscription = subscribe();
      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 1);
      }
      s2a.resolve();

      await p2.promise;
      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 2);
      }
    })(),

    // Delayed subscription.
    (async () => {
      await p2.promise;
      const subscription = subscribe();
      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 2);
      }
    })(),
  ]);

  t.pass();
});

test('update topic waits for first published value', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeUpdateTopic();

  // Coordinated checkpoints.
  const [p1, p2, s1a] = (function* generatePromiseKits() {
    for (;;) yield makePromiseKit();
  })();

  await Promise.all([
    (async () => {
      const subscription = subscribe();
      {
        // The first turn runs until here, so we subscribe and acquire a
        // promise for the first published value in the first turn.
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 1);
      }
      s1a.resolve();
    })(),

    (async () => {
      // The first turn runs until here.
      await null;
      // So we publish the initial value in the subsequent turn.
      const publisher = publish();
      await publisher.next(1);
      p1.resolve();

      await s1a.promise;
      await publisher.next(2);
      p2.resolve();
    })(),

    // A late subscriber sees the most recently published value.
    (async () => {
      await p2.promise;
      const subscription = subscribe();
      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 2);
      }
    })(),
  ]);

  t.pass();
});

test('update topic terminates with error', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeUpdateTopic();
  const publisher = publish();

  const subscription = subscribe();

  await publisher.throw(new TypeError('sentinel'));

  await t.throwsAsync(() => subscription.next(), {
    instanceOf: TypeError,
    message: 'sentinel',
  });
});
