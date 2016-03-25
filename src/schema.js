import _ from 'lodash';
import request from 'request';
import * as jr from 'jsonref';
import * as jp from 'jsonpolice';

var _store = {};

function retriever(url) {
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

export var schemas = {
  core: require('../data/schemas/swagger.json'),
  info: 'http://swagger.io/v2/schema.json#/definitions/info',
  tag: 'http://swagger.io/v2/schema.json#/definitions/tag',
  operation: require('../data/schemas/operation.json'),
  resource: require('../data/schemas/resource.json')
};
export function resolve(dataOrUri) {
  return jr.parse(dataOrUri, _store, retriever);
}
export function create(dataOrUri) {
  return jp.create(dataOrUri, _store, retriever);
}
export var ready = new Promise(function(resolve) {
  var _store = {};
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
