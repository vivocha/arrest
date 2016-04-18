var express = require('express');
var arrest = require('../lib/index');
var SampleResource = require('./sample').SampleResource;

arrest.ready.then(function() {
  console.log('ready');
  var app = express();
  var api = new arrest.API({
    version: '5.4.3',
    title: 'Test API'
  });

  var res = new SampleResource(api);

  return api.attach(app).then(function() {
    console.log('listening');
    app.listen(6545);
  });
}).catch(function(err) {
  console.error('error', err, err.stack);
});
