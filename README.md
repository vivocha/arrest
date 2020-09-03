# Arrest

Arrest is a REST API framework for Node.js, with out-of-the-box support for MongoDB and [JSON-Schema](http://json-schema.org/) fro data definition and validation. 

Arrest lets you write RESTful web services in minutes. It automatically generates a [OpenAPI 3.0.x](http://swagger.io/) formal description of the API and supports input validation using JSON Schema.

Highlight features:

- Compatible with Express 4.x

- Implements simple CRUD semantics on MongoDB

- Supports querying object with the RQL syntax

- Input validation with JSON Schema

- OAuth2 scope checks per operation.

## Arrest Technologies

- **TypeScript**

- **JSON Schema:** a standard to define JSON data.

- **OpenAPI 3.0.x** A JSON format that formally describes an entire API.

Arrest generates a valid OpenAPI definition from the code you write and the JSON schemas you register.

## Main Concepts and Classes

- **Application:** the scheleton of an Arrest API. It opens ports, manages HTTP requests (e.g. Express), it exposes the API endpoints.

- **API:** an "handler" mounted on an Express application. An _API_ is a collection of _Resources_, each of them supporting one or more _Operations_ (contained in a Resource). Resources and JSON Schemas can be added to the API using dedicated methods:

  - `addResource()`
  - `registerSchema()`

- **Resource:** the object that exposes a set operations (or actions). With Arrest and Mongo usually a Resource generates a collection in the DB. It contains a set of allowed operations.

- **Operation:** the action that you can do on the resource. e.g.

  - `attach`: you can register JSON Schema files. E.g.,

    ```typescript
    api.registerSchema(
      "notification",
      require("../../schemas/notification.json")
    );
    ```

  - `getInfo`: merges default and custom info.

  - `getDefaultInfo`: error responses, name of the resource as tag etc...

  - `getCustomInfo`: empty by default, you can define it.

  - **`handler`**: must be implemented in case of base resource. Contains req, res, next.

## MongoDB Native Integration

Arrest integrates with MongoDB and supports a set of methods that can be implemented to prepare, format and execute the query. An arrest MongoOperation calls in pipeline a set of methods that supports the query:

- **`prepareQuery`**: prepare the query
- **`prepareDoc`**: prepare doc to be saved in the db
- **`prepareOpts`**: options to be passed to mongo: sort, skip, limit etc
- **`runOperation`**: execute the command: findone, insertone, delete etc.
- **`redactResult`**: edit/manipulate the result. e.g. used to rename or delete fields, filter fields
- **`processResult`**: send data result

There is also a set of mongo operations provided by Arrest that extend the MongoOperation base operation:

**`CreateMongoOperation`, `PatchMongoOperation`, `QueryMongoOperation`, `ReadMongoOperation`, `RemoveMongoOperation`, `UpdateMongoOperation`.**

Tip: You can image that a query does not contains a doc. A create has no query, but a doc. Update has both: doc and query.

## Installing Arrest

```shell
npm init
npm i typescript
npm i arrest
```

## Examples

### Super Simple Example API

```typescript
import { API, Resource } from "arrest";

const api = new API();
const operation1 = (req, res, next) => {
  res.json({ data: "this is operation 1" });
};
const resource1 = new Resource({
  name: "Resource", //path is automatically constructed from the name `Resource`, making it plural --> /resources
  routes: {
    "/": {
      get: operation1,
    },
  },
});

api.addResource(resource1);
api.listen(3000);
```

The example above creates an API that supports the following operation:

- `GET` on `http://localhost:3000/resources`

Please note how the resources path was automatically constructed using the name of the resource `Resource`, making it plural. The operation1 return the following response

```json
{ "data": "this is operation 1" }
```

### Simple Example API using express

Create an index.ts file with this content.

```typescript
import express from "express";
import { API } from "arrest";

class MyAPI extends API {
  constructor() {
    super();
  }
}

(async () => {
  const app = express();
  const api = new MyAPI();
  app.use("/", await api.router());
  app.listen(3000);
})();
```

### Simple Example with a mongodb resource

Adds logic for mongo to the default base resource operations.

```typescript
import { API, MongoResource } from "arrest";

const api = new API();
api.addResource(
  new MongoResource("mongodb://localhost:27017", { name: "Test" })
);
api.listen(3000);
```

The openAPI specification of the API you just created is available at `http://localhost:3000/openapi.json`

Now you can query your _data_ collection like this:

```shell
curl "http://localhost:3000/tests"
```

You can add a new item:

```shell
curl "http://localhost:3000/tests" -H "Content-Type: application/json" -X POST -d '{ "name": "Jimbo", "surname": "Johnson" }'
```

You can query a specific item by appeding the identifier of the record (the \_id attribute):

```shell
curl "http://localhost:3000/tests/51acc04f196573941f000002"
```

You can update an item:

```shell
curl "http://localhost:3000/tests/51acc04f196573941f000002" -H "Content-Type: application/json" -X PUT -d '{ "name": "Jimbo", "surname": "Smith" }'
```

And finally you can delete an item:

```shell
curl "http://localhost:3000/tests/51acc04f196573941f000002" -X DELETE
```

### Example with mongodb: the MongoResource class

```typescript
import {
  API,
  MongoResource,
  CreateMongoOperation,
  OpenAPIV3,
  Method,
} from "arrest";

const api = new API();

export class ItemResource extends MongoResource {
  constructor(mongoUrl: string) {
    super(
      mongoUrl,
      {
        collection: "items",
      },
      {
        "/create-item": {
          post: CreateItemOperation,
        },
      }
    );
  }
}
class CreateItemOperation extends CreateMongoOperation {
  constructor(resource: MongoResource, path: string, method: Method) {
    super(resource, path, method, "create-item");
  }

  getCustomInfo(): OpenAPIV3.OperationObject {
    return {
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              additionalProperties: false,
              properties: {
                name: {
                  type: "string",
                },
              },
            },
          },
        },
        required: true,
      },
    };
  }
}

api.addResource(new ItemResource("mongodb://localhost:27017/test"));
api.listen(3000);
```

The API above supports the following operations:

- `POST` on `http://localhost:3000/item-resources/create-item`

The resource does not have default mongo operations. These operations can be added with the following code:

```typescript
Object.assign({}, MongoResource.defaultRoutes(), {
  "/create-item": {
    post: CreateItemOperation,
  },
});
```

By adding this Object assign the API now supports the following operations:

- `GET` on `http://localhost:3000/item-resources`
- `POST` on `http://localhost:3000/item-resources`
- `GET` on `http://localhost:3000/item-resources/{id}`
- `PUT` on `http://localhost:3000/item-resources/{id}`
- `DELETE` on `http://localhost:3000/item-resources/{id}`
- `PATCH` on `http://localhost:3000/item-resources/{id}`

These operations are the merge of the default routes operation and the new CreateItemOperation added.

## **Run the Application**

```shell
npm run build:watch
DEBUG=arrest:* node ./dist/index.js
```

## Creating an API

An _API_ is a collection of _Resources_, each supporting one or more _Operations_.

In arrest you create an API by creating an instance of the base `API` class or of a derived class.

```typescript
import { API, OpenAPIV3 } from "arrest";

const api = new API(({ version: "1.0.0" } as any) as OpenAPIV3.InfoObject);
api.listen(3000);
```

The example above creates an API instance described in the route `/openapi.json` as OpenAPI. The OpenAPI object is populated with the properties of the API object.

`GET` on `http://localhost:3000/openapi.json` to view the OpenAPI description.

In the Arrest API you can add instances of the `Resource` class or a derived one. Each resource contains its supported `Routes`, that is a collection of instances of classes derived from the abstract `Operation`, which represents an operation to be executed when an HTTP method is called on a path.

The following code demonstrates this three level structure:

```typescript
import { API, Resource } from "arrest";

const api = new API();

const operation1 = (req, res, next) => {
  res.json({ data: "this is operation 1" });
};
const operation2 = (req, res, next) => {
  res.json({ data: "this is operation 2" });
};
const operation3 = (req, res, next) => {
  res.json({ data: "this is operation 3" });
};

const resource1 = new Resource({
  name: "SomeResource",
  routes: {
    "/": {
      get: operation1,
      post: operation2,
    },
    "/some-path": {
      put: operation3,
    },
  },
});

api.addResource(resource1);
api.listen(3000);
```

The API above supports the following operations:

- `GET` on `http://localhost:3000/some-resources`
- `POST` on `http://localhost:3000/some-resources`
- `PUT` on `http://localhost:3000/some-resources/some-path`

Please note how the some-resources path was automatically constructed using the name of the resource `SomeResource`, making it plural and converting the camelcase in a dash-separated name. This default behaviour can be changed specifying the namePlural and path when creating the resource (e.g. `new Resource({ name: 'OneResource', namePlural: 'ManyResources', path: 'my_resources' })`)

Another other way to produce the same result is:

```typescript
import { API, Resource } from "arrest";

const api = new API();

const resource1 = new Resource({ name: "SomeResource" });

resource1.addOperation("/", "get", function (req, res, next) {
  res.json({ data: "this is operation 1" });
});
resource1.addOperation("/", "post", function (req, res, next) {
  res.json({ data: "this is operation 2" });
});
resource1.addOperation("/some-path", "put", function (req, res, next) {
  res.json({ data: "this is operation 3" });
});

api.addResource(resource1);
api.listen(3000);
```

In real world applications, where resources and operation are in fact more complex, you will want to create class that extend the basic classes in arrest, like in the next example:

```typescript
import { API, Resource, Operation } from "arrest";

class MyOperation extends Operation {
  constructor(resource, path, method) {
    super(resource, path, method, "op1");
  }
  handler(req, res, next) {
    res.json({ data: "this is a custom operation" });
  }
}

class MyResource extends Resource {
  constructor() {
    super();
    this.addOperation(new MyOperation(this, "/", "get"));
  }
}

class MyAPI extends API {
  constructor() {
    super({
      title: "This is a custom API",
      version: "0.9.5",
    });
    this.addResource(new MyResource());
  }
}

const api = new MyAPI();
api.listen(3000);
```

The API above supports `GET`s on `http://localhost:3000/my-resources` (note how the path was in this case constructed automatically from the name of the class MyResource).

By the default, arrest APIs add a special route `/openapi.json` that returns the OpenAPI description of the API: the OpenAPI object is populated with the properties of the API object, Resources are converted into openAPI Tags and Operations are mapped to openAPI Operations.

### Register a Schema

It is possible to register a specific schema and get it by id via the Schema.read operation:

```typescript
import { OpenAPIV3, API } from "arrest";

const api = new API();
const schema: OpenAPIV3.SchemaObject = {
  type: "object",
  additionalProperties: false,
};
api.registerSchema("test", schema);
api.listen(3000);
```

`GET` on `http://localhost:3000/schemas/test`

response:

```json
{
  "type": "object",
  "additionalProperties": false
}
```

#### Define a Schema for an operation

The following example shows how to add schemas to an operation. A schema can have references to other defined schemas.

```typescript
import { API, Resource, Operation } from "arrest";

class Op1 extends Operation {
  count = 0;
  constructor(resource, path, method) {
    super(resource, path, method, "op1");
    this.info.requestBody = {
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/op1_schema2" },
        },
      },
      required: true,
    };
  }
  attach(api) {
    api.registerSchema("op1_schema1", {
      $schema: "http://json-schema.org/schema#",
      type: "object",
      definitions: {
        defA: {
          type: "string",
        },
        defB: {
          type: "object",
          properties: {
            propA: { $ref: "#/definitions/defA" },
          },
        },
      },
      properties: {
        a: {
          type: "boolean",
        },
        b: {
          type: "integer",
        },
      },
      additionalProperties: false,
      required: ["a"],
    });
    api.registerSchema("op1_schema2", {
      $schema: "http://json-schema.org/schema#",
      type: "object",
      properties: {
        c: {
          type: "string",
        },
        d: { $ref: "op1_schema1" },
        e: { $ref: "op1_schema1#/properties/b" },
      },
      additionalProperties: false,
      required: ["d"],
    });
    super.attach(api);
  }
  handler(req, res) {
    res.json({ body: req.body, count: ++this.count });
  }
}
const api: API = new API();
api.addResource(new Resource({ name: "Test" }, { "/a": { post: Op1 } }));
api.listen(3000);
```

The above example will return a 200 ok with the following json body

```json
{ "c": "this is a test", "d": { "a": true } }
```

### Data validation

arrest supports JSON-Schema for data validation. Validation rules are set using the [OpenAPI specification](http://swagger.io/specification/). For instance, the following code show how to validate the body of a `POST` and the query paramters of a `GET`:

```typescript
class MyOperation1 extends arrest.Operation {
  constructor(resource, path, method) {
    super("op1", resource, path, method);
    this.setInfo({
      parameters: [
        {
          name: "body",
          in: "body",
          required: true,
          schema: {
            type: "object",
            required: ["name"],
            additionalProperties: false,
            properties: {
              name: {
                type: "string",
              },
              surname: {
                type: "string",
              },
            },
          },
        },
      ],
    });
  }
  handler(req, res, next) {
    res.json({ data: "this is a op1" });
  }
}

class MyOperation2 extends arrest.Operation {
  constructor(resource, path, method) {
    super("op2", resource, path, method);
    this.setInfo({
      parameters: [
        {
          name: "lang",
          in: "query",
          required: true,
        },
        {
          name: "count",
          in: "query",
        },
      ],
    });
  }
  handler(req, res, next) {
    res.json({ data: "this is a op2" });
  }
}

class MyResource extends arrest.Resource {
  constructor() {
    super();
    this.addOperation(new MyOperation1(this, "/", "post"));
    this.addOperation(new MyOperation2(this, "/", "get"));
  }
}
```

Omitting the body or passing an invalid body (e.g. an object without the name property) when `POST`ing to `http://localhost/my-resources` will return an error. Likewise `GET`ting without a lang parameter or with a count set to anything other than a number will fail.

## The Core

### **Libraries**

- json-ref + json-pointer + json-path —> implemented on json-ref library
- Json-schema —> implemented on json-police library
- Open-api-schema supports json-schema -> open-api-police library
- Arrest library contains all the libraries above.

#### **API**

skip, limit, sort are available.
