import { Resource } from './resource.js';
export { Resource } from './resource.js';

import { RESTResource } from './rest.js';
export { RESTResource } from './rest.js';

import { MongoResource } from './mongo.js';
export { MongoResource } from './mongo.js';

export function create(options) {
  return new Resource(options);
}
export function mount(app, options) {
  (new Resource(options)).mount(app);
}
