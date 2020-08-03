export function addConstraint(query: any, constraint: any): any {
  if (!query) {
    query = {};
  }
  if (typeof constraint === 'object') {
    if (Array.isArray(query)) {
      if (Array.isArray(constraint)) {
        query = query.concat(constraint);
      } else if (query.length && query[query.length - 1].$match) {
        query[query.length - 1].$match = addConstraint(query[query.length - 1].$match, constraint);
      } else if (Object.keys(constraint).length > 0) {
        query.push({ $match: constraint });
      }
    } else if (Array.isArray(constraint)) {
      query = [{ $match: query }].concat(constraint);
    } else {
      if (query.$or) {
        query = { $and: [query, constraint] };
      } else if (query.$and && Object.keys(constraint).length > 0) {
        query.$and.push(constraint);
      } else {
        Object.assign(query, constraint);
      }
    }
  }
  return query;
}
