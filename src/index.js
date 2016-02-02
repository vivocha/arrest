import { Resource } from './resource.js';
export { Resource } from './resource.js';

import { DefaultResource } from './default.js';
export { DefaultResource } from './default.js';

import { MongoResource } from './mongo.js';
export { MongoResource } from './mongo.js';

export function create(options) {
  return new Resource(options);
}
export function mount(app, options) {
  (new Resource(options)).mount(app);
}
