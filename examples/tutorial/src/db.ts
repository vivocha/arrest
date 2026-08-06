import { Db, MongoClient } from 'mongodb';

/**
 * One MongoClient for the process, shared by every chapter that needs a database.
 *
 * Chapters pass the resulting `Db` to each MongoResource rather than a connection string: a string makes
 * arrest connect once per resource, which is one client per collection.
 */
let client: MongoClient | undefined;

export const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/arrest-tutorial';

export async function getDb(): Promise<Db> {
  if (!client) {
    client = await MongoClient.connect(MONGO_URL);
  }
  return client.db();
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = undefined;
  }
}
