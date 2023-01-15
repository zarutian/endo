/* `makeQueue`, `makeStream`, and `makePipe` are utilities for creating async
 * iterator "streams". A Stream is compatible with AsyncIterator and Generator
 * but differ in that every method and argument of both is required.
 * For example, streams always have `return` and `throw` for closing the write
 * side.
 * The `Stream` interface is symmetric, but a stream that sends data and
 * receives undefined is conventionally a `Writer` whereas a stream that
 * receives data and sends undefined is conventionally a `Reader`.
 */

// @ts-check
/// <reference types="ses"/>

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * @template T
 * @typedef {{
 *   resolve(value?: T | Promise<T>): void,
 *   reject(error: Error): void,
 *   promise: Promise<T>
 * }} PromiseKit
 */

// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze = /** @type {<T>(v: T | Readonly<T>) => T} */ (Object.freeze);

/**
 * @template T
 * @returns {import('./types.js').AsyncQueue<T>}
 */
export const makeQueue = () => {
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
  return Far('AsyncQueue', {
    put(value) {
      const { resolve, promise } = makePromiseKit();
      tailResolve(freeze({ value, promise }));
      tailResolve = resolve;
    },
    get() {
      const promise = tailPromise.then(next => next.value);
      tailPromise = tailPromise.then(next => next.promise);
      return harden(promise);
    },
  });
};
harden(makeQueue);

/**
 * @template TValue TValue
 * @param {TValue} value
 * @returns {import('./types.js').AsyncQueue<TValue, unknown>}
 */
export const makeNullQueue = value => {
  return Far('NullQueue', {
    put: () => {},
    get: async () => value,
  });
};

export const nullQueue = makeNullQueue(undefined);

export const nullIteratorQueue = makeNullQueue(
  freeze({ value: undefined, done: false }),
);

/**
 * @template TValue
 */
export const makeChangePubSub = () => {
  // Request pubsub async queue internals
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();

  const pub = () =>
    Far('Pub', {
      /**
       * @param {TValue} value
       */
      put: value => {
        const { resolve, promise } = makePromiseKit();
        tailResolve(freeze({ value, promise }));
        tailResolve = resolve;
        // Unlike a queue, advance the read head for future subscribers.
        tailPromise = promise;
      },
    });

  const sub = () => {
    // Capture the read head for the next published value.
    let cursor = tailPromise;
    return Far('Sub', {
      get: () => {
        const promise = cursor.then(next => next.value);
        cursor = cursor.then(next => next.promise);
        return harden(promise);
      },
    });
  };

  return Far('PubSub', { pub, sub });
};
harden(makeChangePubSub);

/**
 * @template TValue
 */
export const makeUpdatePubSub = () => {
  // Request pubsub async queue internals
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
  let headPromise = tailPromise;

  const pub = () =>
    Far('Pub', {
      /**
       * @param {TValue} value
       */
      put: value => {
        const { resolve, promise } = makePromiseKit();
        tailResolve(freeze({ value, promise }));
        tailResolve = resolve;
        // Unlike a queue, advance the read head for future subscribers.
        headPromise = tailPromise;
        tailPromise = promise;
      },
    });

  const sub = () => {
    // Capture the read head for the next published value.
    let cursor = headPromise;
    return Far('Sub', {
      get: () => {
        const promise = cursor.then(next => next.value);
        cursor = cursor.then(next => next.promise);
        return harden(promise);
      },
    });
  };

  return Far('PubSub', { pub, sub });
};
harden(makeUpdatePubSub);

/**
 * A LatestPubSub enables subscribers to discard intermediate values if they
 * pull slower than the publisher pushes.
 * Where Update and Change PubSubs manage an internal linked-list of every
 * node, such that every subscriber can walk the chain independently, the
 * LatestPubSub tracks each node and whether the node has been replaced, or
 * "expired".
 * When a subscriber advances, it waits for the last yielded node to expire and
 * jumps to the most recently published value.
 *
 * @template TValue
 */
export const makeLatestPubSub = () => {
  let { promise: tailPromise, resolve: resolveTail } = makePromiseKit();
  let { promise: tailExpired, resolve: expireTail } = makePromiseKit();
  let headPromise = tailPromise;
  let headExpired = tailExpired;

  const pub = () =>
    Far('Pub', {
      /**
       * @param {TValue} value
       */
      put: value => {
        const { resolve, promise } = makePromiseKit();
        const { resolve: expire, promise: expired } = makePromiseKit();

        resolveTail(freeze({ value, expired }));
        expireTail();

        resolveTail = resolve;
        expireTail = expire;

        headPromise = tailPromise;
        headExpired = tailExpired;

        tailPromise = promise;
        tailExpired = expired;
      },
    });

  const sub = () => {
    // Capture the read head for the next published value.
    let expired = headExpired;
    return Far('Sub', {
      get: () => {
        // Jump to the most recently published value when the previous value
        // expires.
        const head = expired.then(() => headPromise);
        const promise = head.then(next => next.value);
        expired = head.then(next => next.expired);
        return harden(promise);
      },
    });
  };

  return Far('PubSub', { pub, sub });
};
harden(makeLatestPubSub);

/**
 * @template TRead
 * @template TWrite
 * @template TReadReturn
 * @template TWriteReturn
 * @param {import('./types.js').AsyncSpring<IteratorResult<TRead, TReadReturn>>} acks
 * @param {import('./types.js').AsyncSink<IteratorResult<TWrite, TWriteReturn>>} data
 */
export const makeStream = (acks, data) => {
  const stream = Far('Stream', {
    /**
     * @param {TWrite} value
     */
    next(value) {
      // Note the shallow freeze since value is not guaranteed to be freezable
      // (typed arrays are not).
      data.put(freeze({ value, done: false }));
      return acks.get();
    },
    /**
     * @param {TWriteReturn} value
     */
    return(value) {
      data.put(freeze({ value, done: true }));
      return acks.get();
    },
    /**
     * @param {Error} error
     */
    throw(error) {
      data.put(harden(Promise.reject(error)));
      return acks.get();
    },
    [Symbol.asyncIterator]() {
      return stream;
    },
  });
  return stream;
};
harden(makeStream);

// JSDoc TypeScript seems unable to express this particular function's
// entanglement of queues, but the definition in index.d.ts works for the end
// user.
export const makePipe = () => {
  const data = makeQueue();
  const acks = makeQueue();
  const reader = makeStream(acks, data);
  const writer = makeStream(data, acks);
  return harden([writer, reader]);
};
harden(makePipe);

export const makeChangeTopic = () => {
  const { pub, sub } = makeChangePubSub();
  return Far('Topic', {
    publish: () => makeStream(nullIteratorQueue, pub()),
    subscribe: () => makeStream(sub(), nullIteratorQueue),
  });
};
harden(makeChangeTopic);

export const makeUpdateTopic = () => {
  const { pub, sub } = makeUpdatePubSub();
  return Far('Topic', {
    publish: () => makeStream(nullIteratorQueue, pub()),
    subscribe: () => makeStream(sub(), nullIteratorQueue),
  });
};
harden(makeUpdateTopic);

export const makeLatestTopic = () => {
  const { pub, sub } = makeLatestPubSub();
  return Far('Topic', {
    publish: () => makeStream(nullIteratorQueue, pub()),
    subscribe: () => makeStream(sub(), nullIteratorQueue),
  });
};
harden(makeLatestTopic);

/**
 * @template TRead
 * @template TWrite
 * @template TReadReturn
 * @template TWriteReturn
 * @param {import('./types.js').Stream<TWrite, TRead, TWriteReturn, TReadReturn>} writer
 * @param {import('./types.js').Stream<TRead, TWrite, TReadReturn, TWriteReturn>} reader
 * @param {TWrite} primer
 */
export const pump = async (writer, reader, primer) => {
  /** @param {Promise<IteratorResult<TRead, TReadReturn>>} promise */
  const tick = promise =>
    E.when(
      promise,
      result => {
        if (result.done) {
          return writer.return(result.value);
        } else {
          // Behold: mutual recursion.
          // eslint-disable-next-line no-use-before-define
          return tock(writer.next(result.value));
        }
      },
      (/** @type {Error} */ error) => {
        return writer.throw(error);
      },
    );
  /** @param {Promise<IteratorResult<TWrite, TWriteReturn>>} promise */
  const tock = promise =>
    E.when(
      promise,
      result => {
        if (result.done) {
          return reader.return(result.value);
        } else {
          return tick(reader.next(result.value));
        }
      },
      (/** @type {Error} */ error) => {
        return reader.throw(error);
      },
    );
  await tick(reader.next(primer));
  return undefined;
};
harden(pump);

/**
 * @template TRead
 * @template TWrite
 * @template TReturn
 * @param {AsyncGenerator<TRead, TReturn, TWrite>} generator
 * @param {TWrite} primer
 */
export const prime = (generator, primer) => {
  // We capture the first returned promise.
  const first = generator.next(primer);
  /** @type {IteratorResult<TRead, TReturn>=} */
  let result;
  const primed = Far('Stream', {
    /** @param {TWrite} value */
    async next(value) {
      if (result === undefined) {
        result = await first;
        if (result.done) {
          return result;
        }
      }
      return generator.next(value);
    },
    /** @param {TReturn} value */
    async return(value) {
      if (result === undefined) {
        result = await first;
        if (result.done) {
          return result;
        }
      }
      return generator.return(value);
    },
    /** @param {Error} error */
    async throw(error) {
      if (result === undefined) {
        result = await first;
        if (result.done) {
          throw error;
        }
      }
      return generator.throw(error);
    },
  });
  return primed;
};
harden(prime);

/**
 * @template TIn
 * @template TOut
 * @param {import('./types.js').Reader<TIn>} reader
 * @param {(value: TIn) => TOut} transform
 * @returns {import('./types.js').Reader<TOut>}
 */
export const mapReader = (reader, transform) => {
  const transformedReader = Far('Stream', {
    /**
     * @param {TIn} value
     */
    async next(value) {
      const iteratorResult = await E(reader).next(value);
      if (iteratorResult.done) {
        return iteratorResult;
      }
      return freeze({ value: transform(iteratorResult.value), done: false });
    },
    /**
     * @param {Error} error
     */
    async throw(error) {
      return reader.throw(error);
    },
    /**
     * @param {undefined} value
     */
    async return(value) {
      return reader.return(value);
    },
    [Symbol.asyncIterator]() {
      return transformedReader;
    },
  });
  return transformedReader;
};
harden(mapReader);

/**
 * @template TIn
 * @template TOut
 * @param {import('./types.js').Writer<TOut>} writer
 * @param {(value: TIn) => TOut} transform
 * @returns {import('./types.js').Writer<TIn>}
 */
export const mapWriter = (writer, transform) => {
  const transformedWriter = Far('Stream', {
    /**
     * @param {TIn} value
     */
    async next(value) {
      return writer.next(transform(value));
    },
    /**
     * @param {Error} error
     */
    async throw(error) {
      return writer.throw(error);
    },
    /**
     * @param {undefined} value
     */
    async return(value) {
      return writer.return(value);
    },
    [Symbol.asyncIterator]() {
      return transformedWriter;
    },
  });
  return transformedWriter;
};
harden(mapWriter);
