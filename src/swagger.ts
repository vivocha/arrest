export interface Swagger {
  swagger: Swagger.Version;
  info: Swagger.Info;
  paths: Swagger.Paths;
  host?: string;
  basePath?: string;
  schemes?: Swagger.Scheme[];
  consumes?: string[];
  produces?: string[];
  definitions?: Swagger.Definitions;
  parameters?: Swagger.Parameters;
  responses?: Swagger.Responses;
  security?: Swagger.Security[];
  securityDefinitions?: Swagger.SecurityDefinitions;
  tags?: Swagger.Tag[];
  externalDocs?: Swagger.ExternalDocs;
}

export namespace Swagger {

  export type Version = '2.0';

  export interface Info {
    version: string;
    title: string;
    description?: string;
    termsOfService?: string;
    contact?: {
      name?: string;
      url?: string;
      email?: string;
      [ext: string]: any;
    }
    license?: {
      name: string;
      url?: string;
      [ext: string]: any;
    }
  }

  export interface Paths {
    [path:string]: Reference | Path | any;
  }

  export interface Definitions {
    [key:string]: Swagger.Schema
  }

  export type Parameters = (Parameter | Reference)[];

  export interface Path {
    ["get"]?: Operation;
    ["put"]?: Operation;
    ["post"]?: Operation;
    ["delete"]?: Operation;
    ["options"]?: Operation;
    ["head"]?: Operation;
    ["patch"]?: Operation;
    parameters?: Parameters;
  }

  export interface Operation {
    operationId: string;
    tags?: string[];
    summary?: string;
    description?: string;
    externalDocs?: ExternalDocs;
    consumes?: string[];
    produces?: string[];
    parameters?: Parameters;
    responses: Responses;
    schemes?: Scheme[];
    deprecated?: boolean;
    security?: Security[];
  }

  export type Parameter = BodyParameter | HeaderParameter | QueryParameter | FormDataParameter | PathParameter;

  export type BasicTypes = "string" | "number" | "boolean" | "integer" | "array";

  export type FullTypes = BasicTypes | "object" | "null";

  export interface BodyParameter {
    name: string;
    description?: string;
    ["in"]: "body";
    schema: Schema;
    required?: boolean;
    [ext: string]: any;
  }

  export interface NonBodyParameter extends ParameterSchema {
    name: string;
    description?: string;
  }

  export interface HeaderParameter extends NonBodyParameter {
    ["in"]: "header";
    type: BasicTypes;
    required?: boolean;
    collectionFormat?: CollectionFormat;
  }

  export interface QueryParameter extends NonBodyParameter {
    ["in"]: "query";
    type: BasicTypes;
    required?: boolean;
    allowEmptyValue?: boolean;
    collectionFormat?: CollectionFormatWithMulti;
  }

  export interface FormDataParameter extends NonBodyParameter {
    ["in"]: "formData";
    type: BasicTypes | "file";
    required?: boolean;
    allowEmptyValue?: boolean;
    collectionFormat?: CollectionFormatWithMulti;
  }

  export interface PathParameter extends NonBodyParameter {
    ["in"]: "path"
    type: BasicTypes;
    required?: true;
    collectionFormat?: CollectionFormat;
  }

  export type Scheme = 'http' | 'https' | 'ws' | 'wss';

  export interface Reference {
    $ref: string;
  }

  export interface BasicSchema {
    format?: string;
    ["default"]?: any;
    maximum?: number;
    exclusiveMaximum?: boolean;
    minimum?: number;
    exclusiveMinimum?: boolean;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    ["enum"]?: string[];
    multipleOf?: any;
    [ext: string]: any;
  }

  export interface ParameterSchema extends BasicSchema {
    items?: PrimitiveItem;
  }

  export interface FullSchema extends BasicSchema {
    type?: FullTypes;
    title?: string;
    description?: string;
    required?: boolean;
    additionalProperties?: FullSchema | boolean;
    items?: FullSchema | FullSchema[];
    allOf?: FullSchema[];
    properties?: {
      [key: string]: FullSchema;
    };
    discriminator?: string;
    readOnly?: boolean;
  }

  export interface FileSchema {
    type: "file",
    format?: "string",
    title?: string,
    description?: string,
    ["default"]?: any,
    required?: boolean,
    readOnly?: boolean,
    externalDocs?: ExternalDocs
    [ext: string]: any;
  }

  export type Schema = Reference | FullSchema;

  export type CollectionFormat = "csv" | "ssv" | "tsv" | "pipes";

  export type CollectionFormatWithMulti = CollectionFormat | "multi";

  export interface PrimitiveItem extends ParameterSchema {
    type?: "string" | "number" | "integer" | "boolean" | "array";
    collectionFormat?: CollectionFormat;
  }

  export interface Header extends BasicSchema {
    type: BasicTypes;
    description?: string;
    items?: PrimitiveItem;
    collectionFormat?: CollectionFormat;
  }

  export interface Responses {
    [key:string]: Reference | Response
  }

  export interface Response {
    description: string,
    schema?: Schema | FileSchema,
    headers?: {
      [key:string]: Header;
    };
    examples?: any;
    [ext: string]: any;
  }

  export interface Security {
    [key:string]: string[];
  }

  export interface SecurityDefinitions {
    [key:string]: SecurityDefinition;
  }

  export type SecurityDefinition = SecurityBasicAuth | SecurityAPIKey | SecurityOAuth2Implicit | SecurityOAuth2Password | SecurityOAuth2Application | SecurityOAuth2AccessCode;

  export interface SecurityBasicAuth {
    type: "basic";
    description?: string;
    [ext: string]: any;
  }

  export interface SecurityAPIKey {
    type: "apiKey";
    name: string;
    ["in"]: "header" | "query";
    description?: string;
    [ext: string]: any;
  }

  export interface Scopes {
    [name:string]: string;
  }

  export interface SecurityOAuth2 {
    type: "oauth2";
    scopes?: Scopes;
    description?: string;
    [ext: string]: any;
  }

  export interface SecurityOAuth2Implicit extends SecurityOAuth2 {
    flow: "implicit";
    authorizationUrl: string;
  }

  export interface SecurityOAuth2Password extends SecurityOAuth2 {
    flow: "password";
    tokenUrl: string;
  }

  export interface SecurityOAuth2Application extends SecurityOAuth2 {
    flow: "application";
    tokenUrl: string;
  }

  export interface SecurityOAuth2AccessCode extends SecurityOAuth2 {
    flow: "accessCode";
    authorizationUrl: string;
    tokenUrl: string;
  }

  export interface Tag {
    name: string;
    description?: string;
    externalDocs?: ExternalDocs;
    [ext: string]: any;
  }

  export interface ExternalDocs {
    url: string;
    description?:string;
    [ext: string]: any;
  }
}