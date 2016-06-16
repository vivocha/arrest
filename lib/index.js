module.exports.RESTError = require('./error').RESTError;
module.exports.API = require('./api').API;
module.exports.Resource = require('./resource').Resource;
module.exports.MongoResource = require('./mongo').MongoResource;

var schema = require('./schema');
module.exports.ready = schema.ready;
module.exports.defaultRetriever = schema.defaultRetriever;
