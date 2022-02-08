// @ts-check

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/** @type {import('./types.js').ParseFn} */
export const parseCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);

  const { requires: imports, exports, reexports } = analyzeCommonJS(
    source,
    location,
  );

  /**
   * @param {Object} moduleExports
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleExports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    );
    let moduleReferenceCopy = moduleExports;
    const module = freeze({
      get exports() {
        return moduleReferenceCopy;
      },
      set exports(value) {
        moduleReferenceCopy = value;
      },
    });

    const require = freeze((/** @type {string} */ importSpecifier) => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        // return namespace.default;

        if (Object.keys(namespace).length > 1) {
          return { ...namespace.default, ...namespace }; // this resembles Node's behavior more closely
        } else {
          return namespace.default;
        }
      }
      return namespace;
    });

    functor(
      require,
      moduleReferenceCopy,
      module,
      location, // __filename
      new URL('./', location).toString(), // __dirname
    );
    if (moduleReferenceCopy !== moduleExports) {
      moduleExports.default = moduleReferenceCopy;
    }
  };

  return {
    parser: 'cjs',
    bytes,
    record: freeze({ imports, exports, reexports, execute }),
  };
};
