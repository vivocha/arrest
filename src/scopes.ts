function _defined(o) {
  return typeof o !== 'undefined';
}

export class Scopes {
  constructor(scopes: string | string[] = []) {
    if (typeof scopes === 'string') {
      scopes = scopes.split(' ');
    }
    for (let i = 0, cat, op, on, parts ; i < scopes.length ; i++) {
      parts = scopes[i].split('.');
      if (parts.length !== 2) {
        parts = [ scopes[i], '*' ];
      }
      cat = parts[0];
      op = parts[1];
      if (cat && op) {
        if (cat[0] === '-') {
          on = false;
          cat = cat.substr(1);
        } else if (cat[0] === '+') {
          on = true;
          cat = cat.substr(1);
        } else {
          on = true;
        }
        this.set(cat, op, on);
      } else {
        throw new RangeError();
      }
    }
  }

  set(category: string, operation: string, value: boolean): void {
    if (!this[category]) {
      this[category] = {};
    }
    this[category][operation] = value;
  }
  toArray(): string[] {
    let s: string[] = [];
    for (let i in this) {
      for (let j in this[i]) {
        let v: boolean = (this as any)[i][j] as boolean;
        s.push(`${!v ? '-' : ''}${i}.${j}`);
      }
    }
    return s;
  }
  toString(): string {
    return this.toArray().join(' ');
  }
  bestMatch(category: string, operation: string, value: boolean): boolean {
    let v = false;
    if (_defined(this[category]) && _defined(this[category][operation])) {
      v = this[category][operation];
    } else if (_defined(this[category]) && _defined(this[category]['*'])) {
      v = this[category]['*'];
      if (v && _defined(this['*']) && _defined(this['*'][operation])) {
        v = this['*'][operation];
      }
    } else if (_defined(this['*']) && _defined(this['*'][operation])) {
      v = this['*'][operation];
    } else if (_defined(this['*']) && _defined(this['*']['*'])) {
      v = this['*']['*'];
    }
    return v === value;
  }
  match(_scopes: string | string[] | Scopes): boolean {
    let scopes: Scopes;
    if (typeof _scopes === 'string' || Array.isArray(_scopes)) {
      scopes = new Scopes(_scopes);
    } else {
      scopes = _scopes as Scopes;
    }
    for (let i in scopes) {
      for (let j in scopes[i]) {
        if (!this.bestMatch(i, j, scopes[i][j])) {
          return false;
        }
      }
    }
    return true;
  }
  filter(_scopes: string | string[] | Scopes): Scopes {
    let scopes: Scopes;
    if (typeof _scopes === 'string' || Array.isArray(_scopes)) {
      scopes = new Scopes(_scopes);
    } else {
      scopes = _scopes as Scopes;
    }
    const out = new Scopes();

    for (let category in this) {
      for (let operation in this[category]) {
        if (!this[category][operation]) {
          out.set(category, operation, false);
        }
      }
    }

    for (let category in scopes) {
      for (let operation in scopes[category]) {
        let value = scopes[category][operation];
        if (value) {
          if (category === '*') {
            if (operation === '*') {
              if (this['*'] && this['*']['*']) {
                out.set('*', '*', true);
              } else {
                for (let c in this) {
                  for (let o in this[c]) {
                    if (this[c][o]) {
                      out.set(c, o, true);
                    }
                  }
                }
              }
            } else if (this['*']) {
              if (this['*'][operation] || (this['*'][operation] !== false && this['*']['*'])) {
                out.set('*', operation, true);
              }
            } else {
              for (let c in this) {
                if (this[c][operation] || this[c]['*']) {
                  out.set(c, operation, true);
                }
              }
            }
          } else {
            if (operation === '*') {
              if (this[category]) {
                for (let o in this[category]) {
                  out.set(category, o, this[category][o]);
                }
              } else if (this['*']) {
                if (this['*']['*']) {
                  out.set(category, '*', true);
                } else {
                  for (let o in this['*']) {
                    if (this['*'][o]) {
                      out.set(category, o, true);
                    }
                  }
                }
              }
            } else if (this.bestMatch(category, operation, true)) {
              out.set(category, operation, true);
            }
          }
        } else {
          out.set(category, operation, false);
        }
      }
    }

    if (!out['*'] || !out['*']['*']) {
      for (let category in out) {
        if (category !== '*') {
          let found = false;
          for (let operation in out[category]) {
            if (out[category][operation]) {
              found = true;
            } else if (!out[category]['*'] && (!out['*'] || out['*'][operation] === false)) {
              delete out[category][operation];
            }
          }
          if (!found) {
            delete out[category];
          }
        }
      }
    }
    return out;
  }
}
