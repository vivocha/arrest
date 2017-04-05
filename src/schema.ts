import * as request from 'request';
import * as jr from 'jsonref';
import * as jp from 'jsonpolice';
import { RESTError } from './error'

const json_schema_draft_04 = {
  "id": "http://json-schema.org/draft-04/schema#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "description": "Core schema meta-schema",
  "definitions": {
    "schemaArray": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#" }
    },
    "positiveInteger": {
      "type": "integer",
      "minimum": 0
    },
    "positiveIntegerDefault0": {
      "allOf": [ { "$ref": "#/definitions/positiveInteger" }, { "default": 0 } ]
    },
    "simpleTypes": {
      "enum": [ "array", "boolean", "integer", "null", "number", "object", "string" ]
    },
    "stringArray": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "uniqueItems": true
    }
  },
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uri"
    },
    "$schema": {
      "type": "string",
      "format": "uri"
    },
    "title": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "default": {},
    "multipleOf": {
      "type": "number",
      "minimum": 0,
      "exclusiveMinimum": true
    },
    "maximum": {
      "type": "number"
    },
    "exclusiveMaximum": {
      "type": "boolean",
      "default": false
    },
    "minimum": {
      "type": "number"
    },
    "exclusiveMinimum": {
      "type": "boolean",
      "default": false
    },
    "maxLength": { "$ref": "#/definitions/positiveInteger" },
    "minLength": { "$ref": "#/definitions/positiveIntegerDefault0" },
    "pattern": {
      "type": "string",
      "format": "regex"
    },
    "additionalItems": {
      "anyOf": [
        { "type": "boolean" },
        { "$ref": "#" }
      ],
      "default": {}
    },
    "items": {
      "anyOf": [
        { "$ref": "#" },
        { "$ref": "#/definitions/schemaArray" }
      ],
      "default": {}
    },
    "maxItems": { "$ref": "#/definitions/positiveInteger" },
    "minItems": { "$ref": "#/definitions/positiveIntegerDefault0" },
    "uniqueItems": {
      "type": "boolean",
      "default": false
    },
    "maxProperties": { "$ref": "#/definitions/positiveInteger" },
    "minProperties": { "$ref": "#/definitions/positiveIntegerDefault0" },
    "required": { "$ref": "#/definitions/stringArray" },
    "additionalProperties": {
      "anyOf": [
        { "type": "boolean" },
        { "$ref": "#" }
      ],
      "default": {}
    },
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
    "enum": {
      "type": "array",
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
    "allOf": { "$ref": "#/definitions/schemaArray" },
    "anyOf": { "$ref": "#/definitions/schemaArray" },
    "oneOf": { "$ref": "#/definitions/schemaArray" },
    "not": { "$ref": "#" }
  },
  "dependencies": {
    "exclusiveMaximum": [ "maximum" ],
    "exclusiveMinimum": [ "minimum" ]
  },
  "default": {}
}

export class SchemaRegistry {
  private opts:jr.ParseOptions;

  constructor(scope?:string) {
    this.opts = {
      scope,
      store: {
        'http://json-schema.org/draft-04/schema#': json_schema_draft_04
      },
      retriever: this.retriever.bind(this)
    }
  }

  private async retriever(url: string): Promise<any> {
    return new Promise(function(resolve, reject) {
      request({
        url: url,
        method: 'GET',
        json: true
      }, function(err, response, data) {
        if (err) {
          reject(err);
        } else if (response.statusCode !== 200) {
          reject(new RESTError(response.statusCode as number));
        } else {
          resolve(data);
        }
      });
    });
  }
  async resolve(dataOrUri:any): Promise<any> {
    return jr.parse(dataOrUri, this.opts);
  }
  async create(dataOrUri:any): Promise<jp.Schema> {
    return jp.create(dataOrUri, this.opts);
  }
  register(id, data:any) {
    data.id = jr.normalizeUri(id);
    Object.assign(this.opts.store, { [data.id]: data });
  }
}
