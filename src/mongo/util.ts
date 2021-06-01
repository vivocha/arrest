import { AnyMongoAbility } from '@casl/ability';
import { rulesToQuery } from '@casl/ability/extra';
import { JSONPatch } from 'jsonref';
import { ObjectId } from 'mongodb';

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
      if (query.$or && constraint.$or) {
        query = { $and: [query, constraint] };
      } else if (query.$and && Object.keys(constraint).length > 0) {
        const lastCond = query.$and[query.$and.length - 1];
        if (lastCond && !(lastCond.$or && constraint.$or) && !(lastCond.$and && constraint.$and)) {
          Object.assign(lastCond, constraint);
        } else {
          query.$and.push(constraint);
        }
      } else {
        Object.assign(query, constraint);
      }
    }
  }
  return query;
}

export function escapeMongoKey(key: string): string {
  return key.replace(/%/g, '%25').replace(/\$/g, '%24').replace(/\./g, '%2E');
}

export const unescapeMongoKey: (key: string) => string = decodeURIComponent;

function translateProperties(val: any, f: (key: string) => string): any {
  if (typeof val !== 'object' || val === null || ObjectId.isValid(val)) {
    return val;
  } else if (Array.isArray(val)) {
    return val.map((k) => translateProperties(k, f));
  } else {
    const out: any = {};
    for (let k in val) {
      out[f(k)] = translateProperties(val[k], f);
    }
    return out;
  }
}

export function escapeMongoObject(val: any): any {
  return translateProperties(val, escapeMongoKey);
}

export function unescapeMongoObject(val: any): any {
  return translateProperties(val, unescapeMongoKey);
}

export function patchToMongo(patch: JSONPatch, escape: boolean = false): { query?: any; doc?: any } {
  const out: { query?: any; doc?: any } = {};
  for (let p of patch) {
    const path = (p.path || '')
      .split('/')
      .map((i) => (escape ? escapeMongoKey(i) : i))
      .slice(1);
    if (!path.length) {
      throw new Error('path cannot be empty');
    }
    switch (p.op) {
      case 'add':
        if (!out.doc) out.doc = {};
        if (path.length && path[path.length - 1] == '-') {
          if (path.length === 1) {
            throw new Error("cannot use '-' index at root of path");
          }
          path.pop();
          if (!out.doc.$push) out.doc.$push = {};
          out.doc.$push[path.join('.')] = p.value;
        } else {
          if (!out.doc.$set) out.doc.$set = {};
          out.doc.$set[path.join('.')] = p.value;
        }
        break;
      case 'replace':
        if (path.length && path[path.length - 1] == '-') {
          throw new Error("cannot use '-' index in path of replace");
        } else {
          if (!out.doc) out.doc = {};
          if (!out.doc.$set) out.doc.$set = {};
          out.doc.$set[path.join('.')] = p.value;
          if (!out.query) out.query = {};
          out.query[path.join('.')] = { $exists: true };
        }
        break;
      case 'move':
        const from = (p.from || '').split('/').slice(1);
        if (!from.length) {
          throw new Error('from path cannot be empty');
        }
        if (from.length && from[from.length - 1] == '-') {
          throw new Error("cannot use '-' index in from path of move");
        } else if (path.length && path[path.length - 1] == '-') {
          throw new Error("cannot use '-' index in path of move");
        } else {
          if (!out.doc) out.doc = {};
          if (!out.doc.$rename) out.doc.$rename = {};
          out.doc.$rename[from.join('.')] = path.join('.');
        }
        break;
      case 'remove':
        if (path.length && path[path.length - 1] == '-') {
          throw new Error("cannot use '-' index in path of remove");
        } else {
          if (!out.doc) out.doc = {};
          if (!out.doc.$unset) out.doc.$unset = {};
          out.doc.$unset[path.join('.')] = 1;
        }
        break;
      case 'copy':
        throw new Error('copy not supported');
      case 'test':
        if (path.length && path[path.length - 1] == '-') {
          throw new Error("cannot use '-' index in path of test");
        } else {
          if (!out.query) out.query = {};
          out.query[path.join('.')] = p.value;
        }
        break;
    }
  }
  return out;
}

// The following two functions come from @casl/mongoose and were
// copied (and adapted) here to avoid importing mongoose

function convertToMongoQuery(rule: AnyMongoAbility['rules'][number]) {
  const conditions = rule.conditions!;
  return rule.inverted ? { $nor: [conditions] } : conditions;
}

export function toMongoQuery<T extends AnyMongoAbility>(ability: T, subjectType: Parameters<T['rulesFor']>[1], action: Parameters<T['rulesFor']>[0]) {
  // TODO: typescript doesn't like the type of action, so we work around it
  const f: (...args) => any = rulesToQuery;
  const out = f(ability, action, subjectType, convertToMongoQuery);
  if (Object.keys(out).length === 1 && out.$or?.length === 1) {
    return out.$or[0];
  } else {
    return out;
  }
}
