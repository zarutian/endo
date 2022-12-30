/// <reference types="ses"/>

import { Far, nameForPassableSymbol } from '@endo/pass-style';
import { identPattern, AtAtPrefixPattern } from '../marshal-justin.js';

const { stringify } = JSON;
const { Fail, quote: q } = assert;

export const makeJustinBuilder = out => {
  const outNextJSON = val => out.next(stringify(val));

  /** @type {Builder<string,string>} */
  const justinBuilder = Far('JustinBuilder', {
    buildRoot: _node => out.done(),

    buildUndefined: () => out.next('undefined'),
    buildNull: () => out.next('null'),
    buildBoolean: outNextJSON,
    buildNumber: outNextJSON,
    buildBigint: bigint => out.next(`${bigint}n`),
    buildString: outNextJSON,
    buildSymbol: sym => {
      assert.typeof(sym, 'symbol');
      const name = nameForPassableSymbol(sym);
      if (name === undefined) {
        throw Fail`Symbol must be either registered or well known: ${q(sym)}`;
      }
      const registeredName = Symbol.keyFor(sym);
      if (registeredName === undefined) {
        const match = AtAtPrefixPattern.exec(name);
        assert(match !== null);
        const suffix = match[1];
        assert(Symbol[suffix] === sym);
        assert(identPattern.test(suffix));
        return out.next(`Symbol.${suffix}`);
      }
      return out.next(`Symbol.for(${stringify(registeredName)})`);
    },

    buildRecord: _builtEntries => 'x',
    buildArray: _builtElements => 'x',
    buildTagged: (_tagName, _builtPayload) => 'x',

    buildError: _error => 'x',
    buildRemotable: _remotable => 'x',
    buildPromise: _promise => 'x',
  });
  return justinBuilder;
};
harden(makeJustinBuilder);

export { makeJustinBuilder as makeBuilder };
