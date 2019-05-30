import * as dot from 'dot-prop';
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
        specCopy = rebaseOASDefinition(specCopy, schemaKey, schemas[schemaKey], path);
      }
    }
    return specCopy;
  } catch (err) {
    throw new Error('Unable to rebase schema definitions, check the Schema.');
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
