import { MongoResource } from './../src/mongo';

export class SampleResource extends MongoResource {
  constructor(api) {
    super(api, {
      name: 'Sample',
      namePlural: 'Samples',
      description: 'This is just a sample resource',
      schema: {
        type: 'object'
      },
      db: 'mongodb://50.112.225.234:27017/test',
      collection: 'fede'
    });
  }
}