arrest
======

Swagger REST framework for Node.js, with support for MongoDB and [JSON-Schema](http://json-schema.org/)

[![travis build](https://img.shields.io/travis/vivocha/arrest.svg)](https://travis-ci.org/vivocha/arrest)
[![Coverage Status](https://coveralls.io/repos/github/vivocha/arrest/badge.svg?branch=master)](https://coveralls.io/github/vivocha/arrest?branch=master)
[![npm version](https://img.shields.io/npm/v/arrest.svg)](https://www.npmjs.com/package/arrest)

Arrest lets you write RESTful web services in minutes. It automatically generates a [Swagger](http://swagger.io/) description
of the API and support input validation using JSON-Schemas.

Highlight features:
- Compatible with Express 4.x
- Implements simple CRUD semantics on MongoDB
- Supports querying object with the RQL syntax
- Input validation with JSON-Schema
- Oauth2 scope checks per operation

**Note for 1.3 users**: arrest 3.x is a complete rewrite of the old module and it's not backwards compatible.

## How to Install

```bash
npm install arrest
```

## Super Simple Example

The following sample application shows how to create a simple REST API, using a MongoDB collection as
the data store. In the sample, the path */tests* is linked to a *tests* collection on a MongoDB
instance running on *localhost*:

```js
const arrest = require('arrest');
const api = new arrest.API();

api.addResource(new arrest.MongoResource('mongodb://localhost:27017', { name: 'Test' }));

api.listen(3000);
```

The Swagger specification of the API you just created is available at `http://localhost:3000/swagger.json`

Now you can query your *data* collection like this:

```bash
curl "http://localhost:3000/tests"
```

You can add a new item:

```bash
curl "http://localhost:3000/tests" -H "Content-Type: application/json" -X POST -d '{ "name": "Jimbo", "surname": "Johnson" }'
```

You can query a specific item by appeding the identifier of the record (the _id attribute):

```bash
curl "http://localhost:3000/tests/51acc04f196573941f000002"
```

You can update an item:

```bash
curl "http://localhost:3000/tests/51acc04f196573941f000002" -H "Content-Type: application/json" -X PUT -d '{ "name": "Jimbo", "surname": "Smith" }'
```

And finally you can delete an item:

```bash
curl "http://localhost:3000/tests/51acc04f196573941f000002" -X DELETE
```

## Creating an API

An _API_ is a collection of _Resources_, each supporting one or more _Operations_.

In arrest you create an API by creating an instance of the base `API` class or of a derived class.
You then add instances of the `Resource` class or a derived one. Each resource contains its supported `Routes`, that is
a collection of instances of classes derived from the abstract `Operation`, which represents an operation to be executed
when an HTTP method is called on a path.

The following code demonstrates this three level structure:

```js
const arrest = require('arrest');
const api = new arrest.API();

const operation1 = function(req, res, next) {
  res.json({ data: 'this is operation 1' });
}
const operation2 = function(req, res, next) {
  res.json({ data: 'this is operation 2' });
}
const operation3 = function(req, res, next) {
  res.json({ data: 'this is operation 3' });
}
const resource1 = new arrest.Resource({
  name: 'SomeResource',
  routes: {
    '/': {
      get: operation1,
      post: operation2
    },
    '/some-path': {
      put: operation3
    }
  }
})

api.addResource(resource1);
api.listen(3000);
```

The API above supports the following operations:
- `GET` on `http://localhost/some-resources`
- `POST` on `http://localhost/some-resources`
- `PUT` on `http://localhost/some-resources/some-path`

Please note how the some-resources path was automatically constructed using the name of the resource `SomeResource`, making
it plural and converting the camelcase in a dash-separated name. This default behaviour can be changed specifying the
namePlural and path when creating the resource (e.g. `new Resource({ name: 'OneResource', namePlural: 'ManyResources', path: 'my_resources' })`)

Another other way to produce the same result is:

```js
const arrest = require('arrest');
const api = new arrest.API();

const resource1 = new arrest.Resource({ name: 'SomeResource' });

resource1.addOperation('/', 'get', function(req, res, next) {
  res.json({ data: 'this is operation 1' });
});
resource1.addOperation('/', 'post', function(req, res, next) {
  res.json({ data: 'this is operation 2' });
});
resource1.addOperation('/some-path', 'put', function(req, res, next) {
  res.json({ data: 'this is operation 3' });
});

api.addResource(resource1);
api.listen(3000);
```

In real world applications, where resources and operation are in fact more complex, you will want to create class that
extend the basic classes in arrest, like in the next example:

```js
const arrest = require('arrest');

class MyOperation extends arrest.Operation {
  constructor(resource, path, method) {
    super('op1', resource, path, method);
  }
  handler(req, res, next) {
    res.json({ data: 'this is a custom operation' });
  }
}

class MyResource extends arrest.Resource {
  constructor() {
    super();
    this.addOperation(new MyOperation(this, '/', 'get'));
  }
}

class MyAPI extends arrest.API {
  constructor() {
    super({
      info: {
        title: 'This is a custom API',
        version: '0.9.5'
      }
    });
    this.addResource(new MyResource());
  }
}

const api = new MyAPI();
api.listen(3000);
```

The API above supports `GET`s on `http://localhost/my-resources` (note how the path was in this case constructed automatically
from the name of the class MyResource).

By the default, arrest APIs add a special route `/swagger.json` that returns the Swagger description of the API: the Swagger
object is populated with the properties of the API object, Resources are converted into Swagger Tags and Operations are
mapped to Swagger Operations.

### Data validation

arrest supports JSON-Schema for data validation. Validation rules are set using the [Swagger specification](http://swagger.io/specification/). For instance,
the following code show how to validate the body of a `POST` and the query paramters of a `GET`:

```js
class MyOperation1 extends arrest.Operation {
  constructor(resource, path, method) {
    super('op1', resource, path, method);
    this.setInfo({
      parameters: [
        {
          name: 'body',
          in: 'body',
          required: true,
          schema: {
            type: 'object',
            required: [ 'name' ],
            additionalProperties: false,
            properties: {
              name: {
                type: 'string'
              },
              surname: {
                type: 'string'
              }
            }
          }
        }
      ]
    });
  }
  handler(req, res, next) {
    res.json({ data: 'this is a op1' });
  }
}

class MyOperation2 extends arrest.Operation {
  constructor(resource, path, method) {
    super('op2', resource, path, method);
    this.setInfo({
      parameters: [
        {
          name: 'lang',
          in: 'query',
          type: 'string',
          required: true
        },
        {
          name: 'count',
          in: 'query',
          type: 'integer'
        }
      ]
    });
  }
  handler(req, res, next) {
    res.json({ data: 'this is a op2' });
  }
}

class MyResource extends arrest.Resource {
  constructor() {
    super();
    this.addOperation(new MyOperation1(this, '/', 'post'));
    this.addOperation(new MyOperation2(this, '/', 'get'));
  }
}
```

Omitting the body or passing an invalid body (e.g. an object without the name property) when `POST`ing to
`http://localhost/my-resources` will return an error. Likewise `GET`ting without a lang parameter or with a count
set to anything other than a number will fail.

## Scopes and security validators

**TBA**

## Creating an API with a MongoDB data store

**TBA**
(default api routes)

## Using arrest with express

**TBA**

## Debugging

**TBA**

## API documentation

**TBA**

