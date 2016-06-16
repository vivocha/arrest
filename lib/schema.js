var _ = require('lodash')
  , request = require('request')
  , jr = require('jsonref')
  , jp = require('jsonpolice')

var _store = {};

function defaultRetriever(url) {
  return new Promise(function(resolve, reject) {
    request({
      url: url,
      method: 'GET',
      json: true
    }, function(err, response, data) {
      if (err) {
        reject(err);
      } else if (response.statusCode !== 200) {
        reject(response.statusCode);
      } else {
        resolve(data);
      }
    });
  });
}
var schemas = {
  core: require('../data/schemas/swagger.json'),
  info: 'http://swagger.io/v2/schema.json#/definitions/info',
  tag: 'http://swagger.io/v2/schema.json#/definitions/tag',
  operation: require('../data/schemas/operation.json'),
  resource: require('../data/schemas/resource.json'),
  mongo: require('../data/schemas/mongo.json'),
};
function resolve(dataOrUri, opts) {
  return jr.parse(dataOrUri, _.defaults(opts, {
    store: _store,
    retriever: defaultRetriever
  }));
}
function create(dataOrUri, opts) {
  return jp.create(dataOrUri, _.defaults(opts, {
    store: _store,
    retriever: defaultRetriever
  }));
}
var ready = new Promise(function(resolve) {
  var p = Promise.resolve(true);
  _.each(schemas, function(data, i) {
    p = p.then(function() {
      return create(data).then(function(s) {
        schemas[i] = s;
        return true;
      });
    });
  });
  resolve(p);
});

module.exports.defaultRetriever = defaultRetriever;
module.exports.schemas = schemas;
module.exports.resolve = resolve;
module.exports.create = create;
module.exports.ready = ready;