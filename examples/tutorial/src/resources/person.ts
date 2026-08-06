import { MongoResource, MongoRoutes, OpenAPIV3 } from 'arrest';
import { Db } from 'mongodb';

/**
 * The resource the tutorial grows from chapter 03 onwards.
 *
 * Overriding `schema` alone points both directions — request bodies and responses — at the one registered
 * `person` schema. The pointer is written in full: a getter is not inside a registered schema, so a short
 * `{ $ref: 'person' }` here would be resolved as a URL and fail at router().
 */
export class PersonResource extends MongoResource {
  constructor(db: Db, routes?: MongoRoutes) {
    super(
      db,
      {
        name: 'Person',
        namePlural: 'People',
        description: 'The people known to this API',
        collection: 'people',
        createIndexes: true,
        queryLimit: 50,
      },
      routes
    );
  }

  get schema(): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject {
    return { $ref: '#/components/schemas/person' };
  }

  /**
   * Indexes this collection wants. `createIndexes: true` in the definition makes arrest create the missing
   * ones on first use; without it, it only warns.
   *
   * The base implementation returns a unique index on a custom `id`, or **undefined** when the id is `_id`
   * (which MongoDB indexes anyway) — so spread it defensively rather than `...super.getIndexes()`.
   */
  protected getIndexes(): any[] | undefined {
    return [
      ...(super.getIndexes() || []),
      { key: { email: 1 }, unique: true },
      { key: { country: 1, name: 1 } },
    ];
  }
}
