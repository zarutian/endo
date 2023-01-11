// @ts-check

import { makeImportHookMaker } from './import-hook.js';
import { link } from './link.js';
import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { unpackReadPowers } from './powers.js';
import { ATTENUATORS_COMPARTMENT } from './policy.js';

const { create, entries, assign, keys, freeze } = Object;
const { has } = Reflect;
const { stringify } = JSON;

export const linkAttenuators = async ({
  parserForLanguage,
  powers,
  packageLocation,
  tags,
  packageDescriptor,
  dev,
  exitModules,
  moduleTransforms,
  archiveOnly,
  Compartment,
  policy,
}) => {
  const { read, computeSha512 } = unpackReadPowers(powers);

  const attCompartmentMap = await compartmentMapForNodeModules(
    powers,
    packageLocation,
    tags,
    { name: 'ATTENUATORS', dependencies: packageDescriptor.dependencies }, // TODO: filter dependencies to only contain attenuators?
    null,
    { dev, policy: undefined },
  );
  /** @type {Sources} */
  const sources = Object.create(null);

  const {
    compartments,
    // entry: { compartment: entryCompartmentName },
  } = attCompartmentMap;
  console.log('>>>', compartments);

  const makeImportHook = makeImportHookMaker(
    read,
    packageLocation,
    sources,
    compartments,
    exitModules,
    computeSha512,
  );
  const { compartment } = link(attCompartmentMap, {
    resolve,
    modules: exitModules,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
    archiveOnly,
    Compartment,
  });

  return {
    compartment,
    compartments,
    sources,
  };
};

export const getDeferredAttenuators = ({ policy, attenuatorsCompartment }) => {
  const deferredAttenuators =
    policy && policy.attenuators
      ? Object.fromEntries(
          Object.entries(policy.attenuators).map(([k, v]) => [
            k,
            () => attenuatorsCompartment.import(v),
          ]),
        )
      : {};

  console.log({ deferredAttenuators, policy, attenuatorsCompartment });
  return deferredAttenuators;
};
// export const digestLinkedAttenuators = () => {

//   await Promise.all(
//     values(policy.attenuators).map(attenuatorSpecifier =>
//       compartment.load(attenuatorSpecifier),
//     ),
//   );

//   const compartmentRenames = renameCompartments(compartments, 'ATTENUATORS_');
//   // compartmentRenames[entryCompartmentName] = '<ATTENUATORS>';
//   const attenuatorsCompartments = translateCompartmentMap(
//     compartments,
//     sources,
//     compartmentRenames,
//   );
//   const attenuatorsSources = renameSources(sources, compartmentRenames);

//   return { attenuatorsCompartments, attenuatorsSources };
// }
