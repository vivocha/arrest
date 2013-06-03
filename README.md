arrest
======

REST framework for Node.js, Express and MongoDB

Arrest lets you write RESTful web services in minutes. It works with Express,
implements simple CRUD semantics on MongoDB and the resulting web services
are compatible with the $resource service of AngularJS.

## How to Install

```bash
npm install arrest
```

## Super simple sample

The following sample application shows how to attach a simple REST API to and express
application. In the sample, the path */api* is linked to a *data* collection
on a MongoDB instance running on *localhost*:

```js
var rest = require('arrest')
  , express = require('express')
  , app = express()

app.use(express.bodyParser());

rest.use(app, '/api', rest.RestMongoAPI('mongodb://localhost:27017', 'data'));

app.listen(3000);
```

Now you can query your *data* collection like this:

```bash
curl "http://localhost:3000/api"
```

You can add a new item:

```bash
curl "http://localhost:3000/api" -d "name=Jimbo&surname=Johnson"
```

(for complex object, just do a POST with a JSON body)

You can query a specific item by appeding the identifier of the record (the _id attribute):

```bash
curl "http://localhost:3000/api/51acc04f196573941f000002"
```

You can update an item:

```bash
curl "http://localhost:3000/api/51acc04f196573941f000002" "name=Jimbo&surname=Smith"
```

And finally you can delete an item:

```bash
curl "http://localhost:3000/api/51acc04f196573941f000002" -X DELETE
```

To use this REST service in an [AngularJS](http://angularjs.org) application, all you need to do is to include the
[ngResource](http://docs.angularjs.org/api/ngResource.$resource) service and, in a controller, create a $resource object:

```js
var api = new $resource('/api/:_id', { _id: '@_id' }, {});

$scope.data = api.query();
```
