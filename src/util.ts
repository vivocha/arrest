import { AnyMongoAbility, ForbiddenError, subject } from '@casl/ability';
import { deleteProperty, getProperty, setProperty } from 'dot-prop';
import { dot } from 'eredita';
import _ from 'lodash';
import { DateTime } from 'luxon';
import { ObjectId } from 'mongodb';
import { OpenAPIV3 } from 'openapi-police';
import { API } from './api.js';

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
      const definition = getProperty(fullSpec, newPath);
      fullSpec = rebaseOASDefinition(fullSpec, defKey, definition, newPath, chain);
      const newSchemaName = `${chain.join('_')}`;
      // move to components/schemas and get a new ref related to the new path
      fullSpec = moveDefinition(fullSpec, newSchemaName, newPath);
    }
    deleteProperty(fullSpec, `${path}.definitions`);
  }
  return fullSpec;
}

function moveDefinition(spec: any, newSchemaKey: string, path: string): any {
  // copy the definition to components.schemas root
  const defSchema = getProperty(spec, path);
  setProperty(spec, `components.schemas.${newSchemaKey}`, defSchema);
  // delete the definition at current path
  deleteProperty(spec, path);
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

/**
 *  Types for counting occurrences of schemas and parameters in openapi specs
 */
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
 * and from spec.components.responses when there isn't any $ref pointing to them.
 * The function modifies the document passed in input.
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
  try {
    // build the occurrences table
    (function findAndCount(obj: any, path: string[] = []) {
      for (const key of Object.keys(obj)) {
        const currentPath = [...path, key];
        if (key === '$ref') {
          const refPath = obj[key].split('/');
          // check if ref path is relative to the current spec AND if it points to an existing schema element
          if (obj[key].startsWith('#/components/schemas') && !getProperty(spec as any, refPath.slice(1).join('.'))) {
            throw new Error(`Referenced path "${obj[key]}" doesn't exist in spec.`);
          }
          let type: string;
          let schemaName;
          // set the type of the reference: to "schemas", to "parameters", or to "responses"
          // in case of a reference to a property, type is set to "schemas".
          if (refPath[refPath.length - 2] !== 'properties') {
            // if ref path is like:  #/components/schemas/A
            type = refPath[refPath.length - 2];
          } else {
            // or, if ref path is like:  #/components/schemas/A/properties/a
            type = refPath[refPath.length - 4];
          }

          if (['schemas', 'parameters', 'responses'].includes(refPath[refPath.length - 2])) {
            // in case of a ref like #/components/schemas/A or #/components/parameters/A or #/components/responses/A
            // schema name is the last element of the path
            schemaName = refPath[refPath.length - 1];
          } else if (refPath[refPath.length - 2] === 'properties') {
            // in case of a ref like #/components/schemas/A/properties/B
            // schema name is A, then:
            schemaName = refPath[refPath.length - 3];
          }
          if (['schemas', 'parameters', 'responses'].includes(type)) {
            // check if the reference points to an existing path in spec
            if (!getProperty(spec as any, refPath.slice(1).join('.'))) {
              throw new Error(`Referenced path "${obj[key]}" doesn't exist in spec.`);
            } else {
              occurrences[type][schemaName]['count'] += 1;
              occurrences[type][schemaName]['referencedBy'].push(currentPath.slice(0, 3).join('.'));
            }
          }
        }
        const prop = obj[key];
        // recursively find and count...
        if (prop && typeof prop === 'object') {
          if (!Array.isArray(prop)) {
            findAndCount(prop, currentPath);
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
    throw new Error('Error removing unreferenced schemas. Check openapi spec document and schemas. ' + error.message);
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
  let toDelete = Object.keys(_.pickBy(occurrences['schemas'], (value) => value.count === 0));
  for (const key of toDelete) {
    // current schema path to delete from spec
    const pathToDelete = `components.schemas.${key}`;
    // first, find if the current schema is referenced by other schemas
    const referencedBy = _.pickBy(occurrences['schemas'], (value, key) => _.find(value.referencedBy, (value) => value === pathToDelete));
    if (referencedBy && !_.isEmpty(referencedBy)) {
      // in case of existing references to the current schema
      const referencedByKey = Object.keys(referencedBy)[0];
      const referencedByPath = `components.schemas.${referencedByKey}`;
      if (referencedBy[referencedByKey].count - 1 === 0) {
        // current schema was the last reference in the other schema referencing it, then remove also that schema
        deleteProperty(spec as any, referencedByPath);
      } else {
        // or, update the referencing schema removing the current schema:
        // remove the entry from the referencedBy array in occurrences table
        _.remove(referencedBy[referencedByKey].referencedBy, (v) => v === referencedByPath);
        // update occurrence to save in occurrences table
        const updatedOccurrence = {
          count: referencedBy[referencedByKey].count - 1,
          referencedBy: referencedBy[referencedByKey].referencedBy,
        };
        setProperty(occurrences['schemas'] as any, referencedByKey, updatedOccurrence);
      }
    }
    // finally, delete the current schema with count === 0
    deleteProperty(spec as any, pathToDelete);
  }
  return spec;
}

function deleteUnreferencedParameters(occurrences: any, spec: OpenAPIV3.Document): OpenAPIV3.Document {
  const toDelete = Object.keys(_.pickBy(occurrences['parameters'], (value) => value.count === 0));
  for (const paramName of toDelete) {
    deleteProperty(spec as any, `components.parameters.${paramName}`);
  }
  return spec;
}

/**
 * The fields the conditions of the rules for `action` on `resource` depend on. The fields inside `$and`, `$or` and
 * `$nor` are included, for abilities with a conditions matcher that supports them (CASL's default one does not).
 */
export function getConditionFields(ability: AnyMongoAbility, resource: string, action: string): string[] {
  const out = new Set<string>();
  function collect(conditions: object) {
    for (const [key, value] of Object.entries(conditions)) {
      if (key === '$and' || key === '$or' || key === '$nor') {
        (value as object[]).forEach(collect);
      } else if (!key.startsWith('$')) {
        out.add(key);
      }
    }
  }
  for (const { conditions } of ability.possibleRulesFor(action, resource)) {
    collect(conditions || {});
  }
  return [...out];
}

const snapshot = (value: any): any => (Array.isArray(value) ? value.map(snapshot) : _.isPlainObject(value) ? _.mapValues(value, snapshot) : value);
/**
 * A deep copy of a document (or of each document of a list), for checkAbility to match the conditions against.
 */
export function snapshotData(data: any): WeakMap<object, any> {
  const out = new WeakMap<object, any>();
  for (const doc of Array.isArray(data) ? data : [data]) {
    if (_.isPlainObject(doc)) {
      out.set(doc, _.mapValues(doc, snapshot));
    }
  }
  return out;
}

/**
 * Checks `data` (a document or a list of documents) against the rules of `ability` for `action` on `resource`.
 *
 * Without data, the caller must be allowed to perform `action` on `resource` at all, or a ForbiddenError is thrown.
 * Otherwise every field of every document is checked, and a field that is not permitted is removed if `filterFields`
 * is set, or makes the call fail with a 403 if not. With `filterData`, documents the caller cannot access are removed
 * (or undefined is returned, for a single document) instead.
 *
 * The conditions of the rules are matched in memory against each document, which must therefore include the fields
 * they depend on (see getConditionFields). CASL's default matcher only supports some MongoDB operators, and a condition
 * using any other one (e.g. `$or` or `$expr`) never matches: see docs/reference/authorization.md. If `matchConditions`
 * is false, only the type is checked: use it for documents that are not complete, like the body of a write.
 *
 * When the same data goes through more checks, a previous one might have removed the fields the conditions depend on:
 * pass the `originals` taken with snapshotData before the first check to match the conditions against them instead.
 */
export function checkAbility(
  ability: AnyMongoAbility,
  resource: string,
  action: string,
  data?: any,
  filterFields?: boolean,
  filterData?: boolean,
  matchConditions: boolean = true,
  originals?: WeakMap<object, any>
): any {
  if (!data) {
    ForbiddenError.from(ability).throwUnlessCan(action, resource);
    return undefined;
  } else {
    // What is permitted only depends on which conditions a document matches: the permissions of the fields are cached
    // by the conditional rules matched. Without conditions, it does not depend on the document, and the type is checked
    const conditionalRules = matchConditions ? ability.possibleRulesFor(action, resource).filter((r) => r.conditions) : [];
    const matchDocs = conditionalRules.length > 0;
    const roots = matchDocs ? _.uniq(getConditionFields(ability, resource, action).map((f) => f.split('.')[0])) : [];
    // Conditions are matched against a deep copy of the fields they depend on: subject() tags the object it is given
    // (and refuses to re-tag it with a different type), and the copy is unaffected by the fields deleted while filtering
    const asSubject = (doc: any) => {
      if (!matchDocs) {
        return resource;
      }
      const source = originals?.get(doc) ?? doc;
      return subject(resource, Object.fromEntries(roots.filter((r) => _.has(source, [r])).map((r) => [r, snapshot(source[r])])));
    };
    // CASL's matcher throws on some conditions it does not support (e.g. `$expr: { $gt: [...] }`): like the others,
    // they do not match
    const matches = (rule: (typeof conditionalRules)[number], doc: any) => {
      try {
        return rule.matchesConditions(doc);
      } catch (err) {
        return false;
      }
    };
    // The conditional rules matched by the root document being checked, and the permissions of its fields
    let matched: Set<(typeof conditionalRules)[number]>;
    let fieldsCache: Map<string, boolean>;
    const fieldsCaches = new Map<string, Map<string, boolean>>();
    // The same as ability.can on the root document: the first relevant rule (by priority) whose conditions it matches decides
    const can = (field?: string): boolean => {
      if (!matchDocs) {
        return ability.can(action, resource, field);
      }
      const rule = ability.rulesFor(action, resource, field).find((r) => !r.conditions || matched.has(r));
      return !!rule && !rule.inverted;
    };
    function innerCheckAbility(data: any, path?: string[]): any {
      let foundOne = false;
      if (typeof data === 'object' && data !== null && !ObjectId.isValid(data) && !(data instanceof Date)) {
        if (Array.isArray(data)) {
          data = data.filter((i) => {
            try {
              innerCheckAbility(i, path);
              return true;
            } catch (err) {
              if (filterFields) {
                return false;
              } else {
                API.fireError(403, 'insufficient privileges', undefined, err);
              }
            }
          });
          foundOne = !!data.length;
        } else {
          Object.entries(data).forEach(([key, value]) => {
            try {
              data[key] = innerCheckAbility(value, (path || []).concat(key));
              foundOne = true;
            } catch (err) {
              if (filterFields) {
                delete data[key];
              } else {
                API.fireError(403, 'insufficient privileges', undefined, err);
              }
            }
          });
        }
      }

      if (path && !foundOne) {
        const pathAsString = path.join('.');
        let isPermitted = fieldsCache.get(pathAsString);
        if (typeof isPermitted === 'undefined') {
          fieldsCache.set(pathAsString, (isPermitted = can(pathAsString)));
        }
        if (!isPermitted) {
          throw ForbiddenError.from(ability);
        }
      }
      return data;
    }
    // In a list, each item is the root document its own fields are checked against
    const out: any[] = [];
    for (const doc of Array.isArray(data) ? data : [data]) {
      const rootSubject = asSubject(doc);
      matched = new Set(conditionalRules.filter((r) => matches(r, rootSubject)));
      if (!filterData || can()) {
        const key = conditionalRules.map((r) => (matched.has(r) ? 1 : 0)).join('');
        fieldsCache = fieldsCaches.get(key) ?? fieldsCaches.set(key, new Map()).get(key)!;
        out.push(innerCheckAbility(doc));
      }
    }
    return Array.isArray(data) ? out : out[0];
  }
}

export interface CSVOptions {
  fields: string[] | { [key: string]: string };
  unwind?: string;
  forceUnwind?: boolean;
  separator?: string;
  decimal?: string;
  quotes?: boolean;
  escape?: string;
  eol?: string;
  dateFormat?: string;
  timezone?: string;
  header: boolean;
  filename?: string;
}

export function toCSV(data: any[], options: CSVOptions): string {
  let out: string[][] = [];
  let fieldMap: { [key: string]: string };
  if (Array.isArray(options.fields)) {
    fieldMap = options.fields.reduce((o, i) => {
      o[i] = i;
      return o;
    }, {});
  } else {
    fieldMap = options.fields;
  }
  if (options.header) {
    out.push(Object.values(fieldMap));
  }

  data.forEach((originalItem) => {
    const unwound: any[] = [];
    if (options.unwind) {
      if (options.unwind[0] === '!') {
        options.forceUnwind = true;
        options.unwind = options.unwind.substring(1);
      }
      if (originalItem[options.unwind]?.length) {
        originalItem[options.unwind].forEach((i) => {
          unwound.push({
            ...originalItem,
            [options.unwind!]: i,
          });
        });
      } else if (options.forceUnwind) {
        originalItem[options.unwind] = undefined;
        unwound.push(originalItem);
      }
    } else {
      unwound.push(originalItem);
    }
    unwound.forEach((item) => {
      const l: string[] = [];
      // TODO optimize with a transversal map
      for (let k in fieldMap) {
        const value: any = dot(item, k);
        if (options.decimal && typeof value === 'number') {
          l.push(value.toString().replace(/\./g, options.decimal));
        } else if (value instanceof Date) {
          l.push(
            options.dateFormat
              ? DateTime.fromJSDate(value)
                  .setZone(options.timezone || 'UTC')
                  .toFormat(options.dateFormat)
              : value.toISOString()
          );
        } else {
          l.push((typeof value !== 'undefined' && value !== null ? value : '').toString());
        }
      }
      out.push(l);
    });
  });

  return out
    .map((l) => l.map((f) => (options.quotes ? `"${f.replace(/"/g, `${options.escape || '\\'}"`)}"` : f)).join(options.separator || ','))
    .join(options.eol || '\n');
}
