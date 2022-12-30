/// <reference types="ses"/>

import {
  assertPassableSymbol,
  Far,
  hasOwnPropertyOf,
  nameForPassableSymbol,
  passableSymbolForName,
} from '@endo/pass-style';
import { startsSpecial } from '../encodeToSmallcaps.js';

/** @typedef {import('../types.js').Encoding} Encoding */

const { is, fromEntries, entries } = Object;
const { isArray } = Array;
const { ownKeys } = Reflect;
const { quote: q, details: X, Fail } = assert;

export const makeSmallcapsBuilder = () => {
  const buildString = str => {
    if (startsSpecial(str)) {
      // Strings that start with a special char are quoted with `!`.
      // Since `!` is itself a special character, this trivially does
      // the Hilbert hotel. Also, since the special characters are
      // a continuous subrange of ascii, this quoting is sort-order
      // preserving.
      return `!${str}`;
    }
    // All other strings pass through to JSON
    return str;
  };

  /** @type {Builder<Encoding,Encoding>} */
  const smallcapsBuilder = Far('SmallcapsBuilder', {
    buildRoot: node => node,

    buildUndefined: () => undefined,
    buildNull: () => null,
    buildBoolean: flag => flag,
    buildNumber: num => {
      // Special-case numbers with no digit-based representation.
      if (Number.isNaN(num)) {
        return '#NaN';
      } else if (num === Infinity) {
        return '#Infinity';
      } else if (num === -Infinity) {
        return '#-Infinity';
      }
      // Pass through everything else, replacing -0 with 0.
      return is(num, -0) ? 0 : num;
    },
    buildBigint: bigint => {
      const str = String(bigint);
      return bigint < 0n ? str : `+${str}`;
    },
    buildString,
    buildSymbol: sym => {
      assertPassableSymbol(sym);
      const name = /** @type {string} */ (nameForPassableSymbol(sym));
      return `%${name}`;
    },
    buildRecord: builtEntries =>
      fromEntries(
        builtEntries.map(([name, builtValue]) => [
          buildString(name),
          builtValue,
        ]),
      ),
    buildArray: builtElements => builtElements,
    buildTagged: (tagName, builtPayload) => ({
      '#tag': buildString(tagName),
      payload: builtPayload,
    }),

    buildError: _error => 'x',
    buildRemotable: _remotable => 'x',
    buildPromise: _promise => 'x',
  });
  return smallcapsBuilder;
};
harden(makeSmallcapsBuilder);

const makeSmallcapsRecognizer = () => {
  /**
   * Must be consistent with the full string recognition algorithm.
   * Must return what that algorithm would pass to builder.buildString.
   *
   * @param {string} str
   */
  const recognizeString = str => {
    typeof str === 'string' || Fail`${str} must be a string`;
    if (!startsSpecial(str)) {
      return str;
    }
    const c = str.charAt(0);
    c === '!' || Fail`${str} must encode a string`;
    return str.slice(1);
  };

  const smallcapsRecognizer = (encoding, builder) => {
    switch (typeof encoding) {
      case 'boolean': {
        return builder.buildBoolean(encoding);
      }
      case 'number': {
        return builder.buildNumber(encoding);
      }
      case 'string': {
        if (!startsSpecial(encoding)) {
          return builder.buildString(encoding);
        }
        const c = encoding.charAt(0);
        switch (c) {
          case '!': {
            // un-hilbert-ify the string
            return builder.buildString(encoding.slice(1));
          }
          case '%': {
            return builder.buildSymbol(
              passableSymbolForName(encoding.slice(1)),
            );
          }
          case '#': {
            switch (encoding) {
              case '#undefined': {
                return builder.buildUndefined();
              }
              case '#NaN': {
                return builder.buildNumber(NaN);
              }
              case '#Infinity': {
                return builder.buildNumber(Infinity);
              }
              case '#-Infinity': {
                return builder.buildNumber(-Infinity);
              }
              default: {
                assert.fail(X`unknown constant "${q(encoding)}"`, TypeError);
              }
            }
          }
          case '+': {
            return builder.buildBigint(BigInt(encoding.slice(1)));
          }
          case '-': {
            return builder.buildBigint(BigInt(encoding));
          }
          // case '$': {
          //   const result = decodeRemotableFromSmallcaps(
          //     encoding,
          //     decodeFromSmallcaps,
          //   );
          //   if (passStyleOf(result) !== 'remotable') {
          //     Fail`internal: decodeRemotableFromSmallcaps option must return a remotable: ${result}`;
          //   }
          //   return result;
          // }
          // case '&': {
          //   const result = decodePromiseFromSmallcaps(
          //     encoding,
          //     decodeFromSmallcaps,
          //   );
          //   if (passStyleOf(result) !== 'promise') {
          //     Fail`internal: decodePromiseFromSmallcaps option must return a promise: ${result}`;
          //   }
          //   return result;
          // }
          default: {
            throw Fail`Special char ${q(
              c,
            )} reserved for future use: ${encoding}`;
          }
        }
      }
      case 'object': {
        if (encoding === null) {
          return builder.buildNull();
        }

        if (isArray(encoding)) {
          const builtElements = encoding.map(val =>
            smallcapsRecognizer(val, builder),
          );
          return builder.buildArray(builtElements);
        }

        if (hasOwnPropertyOf(encoding, '#tag')) {
          const { '#tag': tag, payload, ...rest } = encoding;
          ownKeys(rest).length === 0 ||
            Fail`#tag record unexpected properties: ${q(ownKeys(rest))}`;
          return builder.buildTagged(
            recognizeString(tag),
            smallcapsRecognizer(payload, builder),
          );
        }

        // if (hasOwnPropertyOf(encoding, '#error')) {
        //   const result = decodeErrorFromSmallcaps(
        //     encoding,
        //     decodeFromSmallcaps,
        //   );
        //   passStyleOf(result) === 'error' ||
        //     Fail`internal: decodeErrorFromSmallcaps option must return an error: ${result}`;
        //   return result;
        // }

        const buildEntry = ([encodedName, encodedVal]) => {
          typeof encodedName === 'string' ||
            Fail`Property name ${q(
              encodedName,
            )} of ${encoding} must be a string`;
          !encodedName.startsWith('#') ||
            Fail`Unrecognized record type ${q(encodedName)}: ${encoding}`;
          const name = recognizeString(encodedName);
          return [name, smallcapsRecognizer(encodedVal, builder)];
        };
        const builtEntries = entries(encoding).map(buildEntry);
        return builder.buildRecord(builtEntries);
      }
      default: {
        assert.fail(
          X`internal: unrecognized JSON typeof ${q(
            typeof encoding,
          )}: ${encoding}`,
          TypeError,
        );
      }
    }
  };
  return smallcapsRecognizer;
};
harden(makeSmallcapsRecognizer);

export {
  makeSmallcapsBuilder as makeBuilder,
  makeSmallcapsRecognizer as makeRecognizer,
};
