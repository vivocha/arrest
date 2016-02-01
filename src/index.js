import { Resource } from './resource.js';

export { Resource } from './resource.js';

export function create(options) {
  return new Resource(options);
}
export function mount(app, options) {
  (new Resource(options)).mount(app);
}
