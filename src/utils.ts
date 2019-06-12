import * as dot from 'dot-prop';
import * as _ from 'lodash';
import { OpenAPIV3 } from 'openapi-police';

/*
 * Rebasing patterns
 */
const otherRef = new RegExp('^(.+)#/definitions/(.+)', 'g');
const selfRef = new RegExp('^#/definitions/(.+)', 'g');
const otherPropRef = new RegExp('^(.+)#/properties/(.+)', 'g');
const selfPropRef = new RegExp('^#/properties/(.+)', 'g');
const nameRef = new RegExp('^([^#]+[^#]+)$', 'g');
const namePlusHash = new RegExp('^([^#]+)#+$', 'g');
const absoluteRef = new RegExp('^(http:|https:)', 'gi');

/**
 * Rebase a obj.$ref value, following the rules:
 *
 * <ext_schema_name>#/definitions/<schema_name> to #/components/schemas/<ext_schema_name>/definitions/<schema_name>
 * #/definitions/<schema_def_name> to #/components/schemas/<schema_name>/definitions/<schema_def_name>
 * <ext_schema_name>#/properties/<prop_name> to #/components/schemas/<ext_schema_name>/properties/<prop_name>
 * #/properties/<prop_name> to #/components/schemas/<schema_name>/definitions/<prop_name>
 * <ext_schema_name># to #/components/schemas/<ext_schema_name>
 * <ext_schema_name> to #/components/schemas/<ext_schema_name>
 *
 * @export
 * @param {string} schemaName
 * @param {*} obj
 * @returns {*} the modified obj with rebased $ref property
 */
export function refsRebaser(schemaName: string, obj: any): any {
  let rebasedRef = obj.$ref;
  if (obj.$ref.match(selfRef)) {
    rebasedRef = obj.$ref.replace(selfRef, `#/components/schemas/${schemaName}/definitions/$1`);
  } else if (obj.$ref.match(otherRef)) {
    rebasedRef = obj.$ref.replace(otherRef, '#/components/schemas/$1/definitions/$2');
  } else if (obj.$ref.match(otherPropRef)) {
    rebasedRef = obj.$ref.replace(otherPropRef, '#/components/schemas/$1/properties/$2');
  } else if (obj.$ref.match(selfPropRef)) {
    rebasedRef = obj.$ref.replace(selfPropRef, `#/components/schemas/${schemaName}/properties/$1`);
  } else if (obj.$ref.match(nameRef) && !obj.$ref.match(absoluteRef)) {
    rebasedRef = obj.$ref.replace(nameRef, '#/components/schemas/$1');
  } else if (obj.$ref.match(namePlusHash) && !obj.$ref.match(absoluteRef)) {
    rebasedRef = obj.$ref.replace(namePlusHash, '#/components/schemas/$1');
  }
  obj['$ref'] = rebasedRef;
  return obj;
}

/**
 * Recursively move all OpenAPI spec schemas' definitions properties and rebase $refs accordingly
 *
 * @export
 * @param {*} fullSpec - the full OpenAPI spec object eventually containing definitions properties
 * @returns {*} - the transformed spec with rebased definitions
 */
export function rebaseOASDefinitions(fullSpec: any): OpenAPIV3.Document {
  try {
    let specCopy = fullSpec;
    if (specCopy.components && specCopy.components.schemas) {
      const components = specCopy.components;
      for (const schemaKey in components.schemas) {
        let schemas = components.schemas;
        let path = `components.schemas.${schemaKey}`;
        specCopy = rebaseOASDefinition(specCopy, schemaKey, schemas[schemaKey], path, [schemaKey]);
      }
    }
    return specCopy;
  } catch (err) {
    throw new Error('Unable to rebase schema definitions, check the Schema.');
  }
}

function rebaseOASDefinition(fullSpec: any, schemaKey: string, schema: any, path: string, definitionsPath: string[]): any {
  if (schema.definitions) {
    for (const defKey in schema.definitions) {
      // current recursive definition path chain
      const chain = [...definitionsPath, defKey];
      const newPath = `${path}.definitions.${defKey}`;
      const definition = dot.get(fullSpec, newPath);
      fullSpec = rebaseOASDefinition(fullSpec, defKey, definition, newPath, chain);
      const newSchemaName = `${chain.join('_')}`;
      // move to components/schemas and get a new ref related to the new path
      fullSpec = moveDefinition(fullSpec, newSchemaName, newPath);
    }
    dot.delete(fullSpec, `${path}.definitions`);
  }
  return fullSpec;
}

function moveDefinition(spec: any, newSchemaKey: string, path: string): any {
  // copy the definition to components.schemas root
  const defSchema = dot.get(spec, path);
  dot.set(spec, `components.schemas.${newSchemaKey}`, defSchema);
  // delete the definition at current path
  dot.delete(spec, path);
  const newRef = `#/components/schemas/${newSchemaKey}`;
  return updateRefs(spec, `#/${path.split('.').join('/')}`, newRef);
}

function updateRefs(spec: any, originalRef: string, newRef: string): any {
  const regexp = new RegExp(originalRef, 'g');
  let specString = JSON.stringify(spec);
  let newSpecString = specString.replace(regexp, newRef);
  let newSpec = JSON.parse(newSpecString);
  return newSpec;
}

/**
 * Remove $schema property from a JSON Schema
 *
 * @param obj - the JSON Schema object
 * @returns Object - the JSON Schema without $schema definition property
 */
export function removeSchemaDeclaration(obj: any): any {
  if (obj.hasOwnProperty('$schema')) {
    delete obj['$schema'];
  }
  return obj;
}

export interface OccurrencesTable {
  schemas: Occurrence | {};
  parameters: Occurrence | {};
  responses: Occurrence | {};
}
export interface Occurrence {
  count: number;
  referencedBy: string[];
}
/**
 * Remove all schema definitions from spec.components.schemas, from spec.components.parameters,
 * and from spec.components.responses when there isn't any $ref poiting to them.
 * The functions modifies the document in input.
 *
 * @param spec - the OpenAPIV3.Document to "clean"
 * @returns the clean OpenAPIV3.Document
 */
export function removeUnusedSchemas(spec: OpenAPIV3.Document): OpenAPIV3.Document {
  // init occurrences table object
  const occurrences: OccurrencesTable = { schemas: {}, parameters: {}, responses: {} };
  if (spec.components && spec.components.schemas) {
    for (const schema of Object.keys(spec.components.schemas)) {
      occurrences.schemas[schema] = { count: 0, referencedBy: [] };
    }
  }
  if (spec.components && spec.components.parameters) {
    for (const param of Object.keys(spec.components.parameters)) {
      occurrences.parameters[param] = { count: 0, referencedBy: [] };
    }
  }
  if (spec.components && spec.components.responses) {
    for (const response of Object.keys(spec.components.responses)) {
      occurrences.responses[response] = { count: 0, referencedBy: [] };
    }
  }
  // visited objects properties registry
  const parsedProps: any[] = [];
  try {
    // build occurrences table
    (function findAndCount(obj: any, path: string[] = []) {
      for (const key of Object.keys(obj)) {
        const currentPath = [...path, key];
        if (key === '$ref') {
          const refPath = obj[key].split('/');
          let type;
          let schemaName;
          // set the type of the reference: to schemas, to parameters, or to responses
          // in case of a reference to a property, type it is set to schemas.
          if (refPath[refPath.length - 2] !== 'properties') {
            type = refPath[refPath.length - 2];
          } else {
            type = refPath[refPath.length - 4];
          }
          // in case of a ref like #/components/schemas/A or #/components/parameters/A or #/components/responses/A
          if (['schemas', 'parameters', 'responses'].includes(refPath[refPath.length - 2])) {
            schemaName = refPath[refPath.length - 1];
          } else if (refPath[refPath.length - 2] === 'properties') {
            // in case of a ref like #/components/schemas/A/properties/B
            // schema name is A, then:
            schemaName = refPath[refPath.length - 3];
          }
          if (['schemas', 'parameters', 'responses'].includes(type)) {
            // check if the reference points to an existing path in spec
            if (!dot.get(spec as any, refPath.slice(1).join('.'))) {
              throw new Error(`Referenced path "${obj[key]}" doesn't exist in spec.`);
            } else {
              occurrences[type][schemaName]['count'] += 1;
              occurrences[type][schemaName]['referencedBy'].push(currentPath.slice(0, 3).join('.'));
            }
          }
        }
        const prop = obj[key];
        if (prop && typeof prop === 'object') {
          if (!Array.isArray(prop)) {
            if (!parsedProps.find(p => p === prop)) {
              parsedProps.push(prop);
              findAndCount(prop, currentPath);
            }
          } else {
            // the property value is an array
            for (let i = 0; i < prop.length; i++) {
              findAndCount(prop[i], currentPath);
            }
          }
        }
      }
    })(spec);
    // delete unreferenced elements from openapi spec
    spec = deleteUnreferencedElements(occurrences, spec);
  } catch (error) {
    throw new Error('Error removing unreferenced schemas. Check openapi spec document and schemas.' + error.message);
  }
  return spec;
}

function deleteUnreferencedElements(occurrences: any, spec: OpenAPIV3.Document): OpenAPIV3.Document {
  spec = deleteUnreferencedSchemas(occurrences, spec);
  spec = deleteUnreferencedParameters(occurrences, spec);
  return spec;
}

function deleteUnreferencedSchemas(occurrences: any, spec: OpenAPIV3.Document): OpenAPIV3.Document {
  // remove all schemas with count === 0 in occurrences table
  let toDelete = Object.keys(_.pickBy(occurrences['schemas'], value => value.count === 0));
  for (const key of toDelete) {
    // current schema path to delete from spec
    const pathToDelete = `components.schemas.${key}`;
    // first, find if the current schema is referenced by other schemas
    const referencedBy = _.pickBy(occurrences['schemas'], (value, key) => _.find(value.referencedBy, value => value === pathToDelete));
    if (referencedBy && !_.isEmpty(referencedBy)) {
      // in case of existing references to the current schema
      const referencedByKey = Object.keys(referencedBy)[0];
      const referencedByPath = `components.schemas.${referencedByKey}`;
      if (referencedBy[referencedByKey].count - 1 === 0) {
        // current schema was the last reference in the other schema referencing it, then remove also that schema
        dot.delete(spec as any, referencedByPath);
      } else {
        // or, update the referencing schema removing the current schema
        dot.set(occurrences['schemas'] as any, referencedByKey, {
          count: referencedBy[referencedByKey].count - 1,
          referencedBy: _.remove(referencedBy[referencedByKey].referencedBy, v => v === referencedByPath)
        });
      }
    }
    // finally, delete the current schema with count === 0
    dot.delete(spec as any, pathToDelete);
  }
  return spec;
}

function deleteUnreferencedParameters(occurrences: any, spec: OpenAPIV3.Document): OpenAPIV3.Document {
  const toDelete = Object.keys(_.pickBy(occurrences['parameters'], value => value.count === 0));
  for (const paramName of toDelete) {
    dot.delete(spec as any, `components.parameters.${paramName}`);
  }
  return spec;
}
