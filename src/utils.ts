import * as dot from 'dot-prop';
import * as _ from 'lodash';
import { OpenAPIV3 } from 'openapi-police';

/**
 * Rebase a obj.$ref value, following the rules:
 *
 * <ext_schema_name>#/definitions/<schema_name> to #/components/schemas/<ext_schema_name>/definitions/<schema_name>
 * #/definitions/<schema_def_name> to #/components/schemas/<schema_name>/definitions/<schema_def_name>
 *
 * @export
 * @param {string} schemaName
 * @param {*} obj
 * @returns {*} the modified obj with rebased $ref property
 */
export function refsRebaser(schemaName: string, obj: any): any {
  const otherRef = new RegExp('^(.+)#/definitions/(.+)', 'g');
  const selfRef = new RegExp('^#/definitions/(.+)', 'g');
  let rebasedRef = obj.$ref;
  if (obj.$ref.match(selfRef)) {
    rebasedRef = obj.$ref.replace(selfRef, `#/components/schemas/${schemaName}/definitions/$1`);
  } else if (obj.$ref.match(otherRef)) {
    rebasedRef = obj.$ref.replace(otherRef, '#/components/schemas/$1/definitions/$2');
  }
  obj['$ref'] = rebasedRef;
  return obj;
}

/**
 * Recursively move all OpenAPI spec schemas' definitions properties and rebase $refs accordingly
 *
 * @export
 * @param {*} fullSpec - the full OpenAPI spec object
 * @returns {*} - the transformed spec
 */
export function rebaseOASDefinitions(fullSpec: OpenAPIV3.Document): OpenAPIV3.Document {
  try {
    let specCopy = _.cloneDeep(fullSpec);
    if (specCopy.components && specCopy.components.schemas) {
      const components = specCopy.components;
      for (const schemaKey in components.schemas) {
        let schemas = components.schemas;
        let path = `components.schemas.${schemaKey}`;
        specCopy = rebaseOASDefinition(specCopy, schemaKey, schemas[schemaKey], path);
      }
    }
    return specCopy;
  } catch (err) {
    console.error('Unable to rebase schema definitions, error is', err);
    return fullSpec;
  }
}

function rebaseOASDefinition(fullSpec: any, schemaKey: string, schema: any, path: string): any {
  if (schema.definitions) {
    for (const defKey in schema.definitions) {
      const newPath = `${path}.definitions.${defKey}`;
      const definition = dot.get(fullSpec, newPath);
      fullSpec = rebaseOASDefinition(fullSpec, defKey, definition, newPath);
      const newSchemaName = fullSpec.components.schemas[defKey] ? `${schemaKey}-${defKey}` : defKey;
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
