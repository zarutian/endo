// @ts-check
/* eslint-disable no-await-in-loop */

import '@endo/init/debug.js';

import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';
import { makePromiseKit } from '@endo/promise-kit';
import { makeLatestTopic } from '../index.js';

const test = wrapTest(rawTest);

test('latest subscriber sees every published value when pulling rapidly', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeLatestTopic();
  const publisher = publish();

  // Coordinated checkpoints.
  const [p1, p2, p3, p4, p5, s1, s2, s3, s4, s5] =
    (function* generatePromiseKits() {
      for (;;) yield makePromiseKit();
    })();

  await Promise.all([
    (async () => {
      await s1.promise;
      await publisher.next(1);
      p1.resolve();

      await s2.promise;
      await publisher.next(2);
      p2.resolve();

      await s3.promise;
      await publisher.next(3);
      p3.resolve();

      await s4.promise;
      await publisher.next(4);
      p4.resolve();

      await s5.promise;
      await publisher.return('EOL');
      p5.resolve();
    })(),

    (async () => {
      // Subscribe before first publish.
      const subscription = subscribe();
      s1.resolve();
      await p1.promise;

      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 1);
        t.is(iteratorResult.done, false);
      }

      s2.resolve();
      await p2.promise;

      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 2);
        t.is(iteratorResult.done, false);
      }

      s3.resolve();
      await p3.promise;

      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 3);
        t.is(iteratorResult.done, false);
      }

      s4.resolve();
      await p4.promise;

      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 4);
        t.is(iteratorResult.done, false);
      }

      s5.resolve();
      await p5.promise;

      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 'EOL');
        t.is(iteratorResult.done, true);
      }
    })(),
  ]);

  t.pass();
});

test('latest subscriber does not see duplicates when pulling frequently', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeLatestTopic();
  const publisher = publish();
  const subscriber = subscribe();
  const iteratorResult1 = subscriber.next();
  const iteratorResult2 = subscriber.next();
  await publisher.next(1);
  await publisher.next(2);
  t.deepEqual(await iteratorResult1, { value: 1, done: false });
  t.deepEqual(await iteratorResult2, { value: 2, done: false });
});

test('latest subscriber sees latest value when subscribing after publish', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeLatestTopic();
  const publisher = publish();
  await publisher.next(1);
  const subscriber = subscribe();
  const iteratorResult = await subscriber.next();
  t.deepEqual(iteratorResult, { value: 1, done: false });
});

test('latest subscriber only sees latest value when pulling', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeLatestTopic();
  const publisher = publish();

  // Coordinated checkpoints.
  const [p1, s1a, s1b] = (function* generatePromiseKits() {
    for (;;) yield makePromiseKit();
  })();

  await Promise.all([
    (async () => {
      await s1a.promise;
      await publisher.next(1);
      await publisher.next(2);
      await publisher.next(3);
      await publisher.next(4);
      p1.resolve();

      await s1b.promise;
      await publisher.return('EOL');
    })(),

    // Subscribe before first publish.
    (async () => {
      const subscription = subscribe();
      s1a.resolve();

      await p1.promise;
      {
        const iteratorResult = await subscription.next();
        t.is(iteratorResult.value, 4);
      }
      s1b.resolve();
    })(),
  ]);

  t.pass();
});

test('latest terminates with error', async (/** @type {import('ava').Assertions} */ t) => {
  const { publish, subscribe } = makeLatestTopic();
  const publisher = publish();

  const subscription = subscribe();

  await publisher.throw(new TypeError('sentinel'));

  await t.throwsAsync(() => subscription.next(), {
    instanceOf: TypeError,
    message: 'sentinel',
  });
});
