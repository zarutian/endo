/// <reference types="ses"/>

import { Far, getTag, makeTagged, passStyleOf } from '@endo/pass-style';

const { fromEntries } = Object;
const { ownKeys } = Reflect;
const { quote: q, details: X } = assert;

export const makeSubgraphBuilder = () => {
  const ident = val => val;

  /** @type {Builder<any,any>} */
  const subgraphBuilder = Far('SubgraphBuilder', {
    buildRoot: ident,

    buildUndefined: () => undefined,
    buildNull: () => null,
    buildBoolean: ident,
    buildNumber: ident,
    buildBigint: ident,
    buildString: ident,
    buildSymbol: ident,
    buildRecord: builtEntries => harden(fromEntries(builtEntries)),
    buildArray: ident,
    buildTagged: (tagName, builtPayload) => makeTagged(tagName, builtPayload),

    buildError: ident,
    buildRemotable: ident,
    buildPromise: ident,
  });
  return subgraphBuilder;
};
harden(makeSubgraphBuilder);

export const makeSubgraphRecognizer = () => {
  const subgraphRecognizer = (passable, builder) => {
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded into smallcaps strings.
    const passStyle = passStyleOf(passable);
    switch (passStyle) {
      case 'null': {
        return builder.buildNull();
      }
      case 'boolean': {
        return builder.buildBoolean(passable);
      }
      case 'string': {
        return builder.buildString(passable);
      }
      case 'undefined': {
        return builder.buildUndefined();
      }
      case 'number': {
        return builder.buildNumber(passable);
      }
      case 'bigint': {
        return builder.buildBigint(passable);
      }
      case 'symbol': {
        return builder.buildSymbol(passable);
      }
      case 'copyRecord': {
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names = ownKeys(passable).sort();
        return builder.buildCopyRecord(
          names.map(name => [
            subgraphRecognizer(name, builder),
            subgraphRecognizer(passable[name], builder),
          ]),
        );
      }
      case 'copyArray': {
        return builder.buildCopyRecord(
          passable.map(el => subgraphRecognizer(el, builder)),
        );
      }
      case 'tagged': {
        return builder.buildTagged(
          subgraphRecognizer(getTag(passable), builder),
          subgraphRecognizer(passable.payload, builder),
        );
      }
      // case 'remotable': {
      //   const result = encodeRemotableToSmallcaps(
      //     passable,
      //     encodeToSmallcapsRecur,
      //   );
      //   if (typeof result === 'string' && result.startsWith('$')) {
      //     return result;
      //   }
      //   // `throw` is noop since `Fail` throws. But linter confused
      //   throw Fail`internal: Remotable encoding must start with "$": ${result}`;
      // }
      // case 'promise': {
      //   const result = encodePromiseToSmallcaps(
      //     passable,
      //     encodeToSmallcapsRecur,
      //   );
      //   if (typeof result === 'string' && result.startsWith('&')) {
      //     return result;
      //   }
      //   throw Fail`internal: Promise encoding must start with "&": ${result}`;
      // }
      // case 'error': {
      //   const result = encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur);
      //   assertEncodedError(result);
      //   return result;
      // }
      default: {
        assert.fail(
          X`internal: Unrecognized passStyle ${q(passStyle)}`,
          TypeError,
        );
      }
    }
  };
  return subgraphRecognizer;
};
harden(makeSubgraphRecognizer);

export {
  makeSubgraphBuilder as makeBuilder,
  makeSubgraphRecognizer as makeRecognizer,
};
