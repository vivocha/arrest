import { Db } from 'mongodb';

const PEOPLE = [
  { name: 'Ada Lovelace', email: 'ada@example.com', age: 36, country: 'GB', tags: [{ name: 'maths' }, { name: 'pioneer' }] },
  { name: 'Alan Turing', email: 'alan@example.com', age: 41, country: 'GB', tags: [{ name: 'maths' }] },
  { name: 'Grace Hopper', email: 'grace@example.com', age: 85, country: 'US', tags: [{ name: 'compilers' }] },
  { name: 'Margaret Hamilton', email: 'margaret@example.com', age: 88, country: 'US', tags: [{ name: 'apollo' }] },
  { name: 'Rita Levi-Montalcini', email: 'rita@example.com', age: 103, country: 'IT', tags: [] },
  { name: 'Federico Faggin', email: 'federico@example.com', age: 84, country: 'IT', tags: [{ name: 'silicon' }] },
  { name: 'Barbara Liskov', email: 'barbara@example.com', age: 85, country: 'US', tags: [{ name: 'types' }] },
  { name: 'Edsger Dijkstra', email: 'edsger@example.com', age: 72, country: 'NL', tags: [{ name: 'algorithms' }] },
];

/**
 * Fill the people collection, so a freshly started chapter has something to query. Idempotent: it does
 * nothing if the collection already holds documents.
 */
export async function seedPeople(db: Db): Promise<void> {
  const coll = db.collection('people');
  if ((await coll.countDocuments({})) > 0) {
    return;
  }
  await coll.insertMany(PEOPLE.map((p) => ({ ...p, created: new Date().toISOString() })));
  console.log(`seeded ${PEOPLE.length} people`);
}
