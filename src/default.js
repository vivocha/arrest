import { Resource } from './resource'

export class DefaultResource extends Resource {
  constructor(_options, _class) {
    if (!_options.routes) {
      _options.routes = DefaultResource.defaultRoutes;
    }
    super(_options, _class);
  }
  query(req, res) {
    res.send('query');
  }
  read(req, res) {
    console.log('hi');
    res.send('get ' + req.params.id);
  }
  create(req, res) {
    res.send('create');
  }
  updateAll(req, res) {
    res.send('updateAll');
  }
  updateOne(req, res) {
    res.send('updateOne');
  }
  deleteAll(req, res) {
    res.send('deleteAll');
  }
  deleteOne(req, res) {
    res.send('query');
  }
  authAdmin(req, res, next) {
    console.log('admin!');
    next();
  }
}
DefaultResource.defaultRoutes = [
  { method: 'GET', mount: '', handler: 'query' },
  { method: 'GET', mount: '/:id', handler: 'read', zone: 'admin' },
  { method: 'POST', mount: '', handler: 'create' },
  { method: 'PUT', mount: '', handler: 'updateAll' },
  { method: 'PUT', mount: '/:id', handler: 'updateOne' },
  { method: 'DELETE', mount: '', handler: 'deleteAll' },
  { method: 'DELETE', mount: '/:id', handler: 'deleteOne' }
];
