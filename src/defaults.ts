import { OpenAPIV3 } from 'openapi-police';

export const DEFAULT_DOCUMENT: OpenAPIV3.Document = {
  openapi: '3.0.2',
  info: {
    title: 'REST API',
    version: '1.0.0'
  },
  components: {
    schemas: {
      "metadata": {
        "description": "Metadata associated with the resource",
        "type": "object"
      },
      "objectId": {
        "description": "Name of the property storing the unique identifier of the resource",
        "type": "string"
      },
      "errorResponse": {
        "type": "object",
        "properties": {
          "error": {
            "type": "integer",
            "minimum": 100
          },
          "message": {
            "type": "string"
          },
          "info": {
            "type": "string"
          }
        },
        "required": [ "error", "message" ]
      }
    },
    responses: {
      "defaultError": {
        "description": "Default/generic error response",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/errorResponse" }
          }
        }
      },
      "notFound": {
        "description": "The requested/specified resource was not found",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/errorResponse" }
          }
        }
      }
    },
    parameters: {
      "id": {
        "description": "Unique identifier of the resource",
        "name": "id",
        "in": "path",
        "schema": {
          "type": "string"
        },
        "required": true
      },
      "limit": {
        "name": "limit",
        "in": "query",
        "description": "Maximum number of items to return",
        "schema": {
          "type": "integer",
          "default": 20,
          "minimum": 1,
          "maximum": 100
        }
      },
      "skip": {
        "name": "skip",
        "in": "query",
        "description": "Skip the specified number of items",
        "schema": {
          "type": "integer",
          "default": 0,
          "minimum": 0
          }
      },
      "fields": {
        "name": "fields",
        "in": "query",
        "description": "Return only the specified properties",
        "schema": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        }
      },
      "sort": {
        "name": "sort",
        "in": "query",
        "description": "Sorting criteria, using RQL syntax (a,-b,+c)",
        "schema": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        }
      },
      "query": {
        "name": "q",
        "in": "query",
        "description": "Return only items matching the specified [RQL](https://github.com/persvr/rql) query. This parameter can also be used to specify the ordering criteria of the results",
        "schema": {
          "type": "string"
        }
      }
    }
  },
  paths: {}
};
export const JSON_SCHEMA_DRAFT_7 = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "http://json-schema.org/draft-07/schema#",
  "title": "Core schema meta-schema",
  "definitions": {
      "schemaArray": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#" }
      },
      "nonNegativeInteger": {
          "type": "integer",
          "minimum": 0
      },
      "nonNegativeIntegerDefault0": {
          "allOf": [
              { "$ref": "#/definitions/nonNegativeInteger" },
              { "default": 0 }
          ]
      },
      "simpleTypes": {
          "enum": [
              "array",
              "boolean",
              "integer",
              "null",
              "number",
              "object",
              "string"
          ]
      },
      "stringArray": {
          "type": "array",
          "items": { "type": "string" },
          "uniqueItems": true,
          "default": []
      }
  },
  "type": ["object", "boolean"],
  "properties": {
      "$id": {
          "type": "string",
          "format": "uri-reference"
      },
      "$schema": {
          "type": "string",
          "format": "uri"
      },
      "$ref": {
          "type": "string",
          "format": "uri-reference"
      },
      "$comment": {
          "type": "string"
      },
      "title": {
          "type": "string"
      },
      "description": {
          "type": "string"
      },
      "default": true,
      "readOnly": {
          "type": "boolean",
          "default": false
      },
      "examples": {
          "type": "array",
          "items": true
      },
      "multipleOf": {
          "type": "number",
          "exclusiveMinimum": 0
      },
      "maximum": {
          "type": "number"
      },
      "exclusiveMaximum": {
          "type": "number"
      },
      "minimum": {
          "type": "number"
      },
      "exclusiveMinimum": {
          "type": "number"
      },
      "maxLength": { "$ref": "#/definitions/nonNegativeInteger" },
      "minLength": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
      "pattern": {
          "type": "string",
          "format": "regex"
      },
      "additionalItems": { "$ref": "#" },
      "items": {
          "anyOf": [
              { "$ref": "#" },
              { "$ref": "#/definitions/schemaArray" }
          ],
          "default": true
      },
      "maxItems": { "$ref": "#/definitions/nonNegativeInteger" },
      "minItems": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
      "uniqueItems": {
          "type": "boolean",
          "default": false
      },
      "contains": { "$ref": "#" },
      "maxProperties": { "$ref": "#/definitions/nonNegativeInteger" },
      "minProperties": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
      "required": { "$ref": "#/definitions/stringArray" },
      "additionalProperties": { "$ref": "#" },
      "definitions": {
          "type": "object",
          "additionalProperties": { "$ref": "#" },
          "default": {}
      },
      "properties": {
          "type": "object",
          "additionalProperties": { "$ref": "#" },
          "default": {}
      },
      "patternProperties": {
          "type": "object",
          "additionalProperties": { "$ref": "#" },
          "propertyNames": { "format": "regex" },
          "default": {}
      },
      "dependencies": {
          "type": "object",
          "additionalProperties": {
              "anyOf": [
                  { "$ref": "#" },
                  { "$ref": "#/definitions/stringArray" }
              ]
          }
      },
      "propertyNames": { "$ref": "#" },
      "const": true,
      "enum": {
          "type": "array",
          "items": true,
          "minItems": 1,
          "uniqueItems": true
      },
      "type": {
          "anyOf": [
              { "$ref": "#/definitions/simpleTypes" },
              {
                  "type": "array",
                  "items": { "$ref": "#/definitions/simpleTypes" },
                  "minItems": 1,
                  "uniqueItems": true
              }
          ]
      },
      "format": { "type": "string" },
      "contentMediaType": { "type": "string" },
      "contentEncoding": { "type": "string" },
      "if": { "$ref": "#" },
      "then": { "$ref": "#" },
      "else": { "$ref": "#" },
      "allOf": { "$ref": "#/definitions/schemaArray" },
      "anyOf": { "$ref": "#/definitions/schemaArray" },
      "oneOf": { "$ref": "#/definitions/schemaArray" },
      "not": { "$ref": "#" }
  },
  "default": true
}

