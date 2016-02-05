var arrest = require('./../lib/index')
  , express = require('express')
  , app = express()

try {
  var api = new arrest.MongoResource({ name: 'test', namePlural: 'tests', db: 'aaa', collection: 'xyz' });
  api.mount(app);
  app.listen('6545');
} catch(e) {
  if (e.name === 'InitError') {
    for (var i = 0 ; i < e.errors.length ; i++) {
      console.error(e.errors[i].message, e.errors[i].path);
    }
  } else {
    console.error(e);
  }
}
