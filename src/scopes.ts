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
    let out = new Scopes;
    for (let i in scopes) {
      for (let j in scopes[i]) {
        if (this.bestMatch(i, j, scopes[i][j])) {
          out.set(i, j, scopes[i][j]);
        }
      }
    }
    return out;
  }
}
