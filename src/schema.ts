import * as request from 'request';
import * as jr from 'jsonref';
import * as jp from 'jsonpolice';
import { RESTError } from './error'

export class SchemaRegistry {
  private opts:jr.ParseOptions;

  constructor(scope?:string) {
    this.opts = {
      scope,
      store: {},
      retriever: this.retriever.bind(this)
    }
  }

  private retriever(url: string): Promise<any> {
    return new Promise(function(resolve, reject) {
      request({
        url: url,
        method: 'GET',
        json: true
      }, function(err, response, data) {
        if (err) {
          reject(err);
        } else if (response.statusCode !== 200) {
          reject(new RESTError(response.statusCode || 500));
        } else {
          resolve(data);
        }
      });
    });
  }
  resolve(dataOrUri:any): Promise<any> {
    return jr.parse(dataOrUri, this.opts);
  }
  create(dataOrUri:any): Promise<jp.Schema> {
    return jp.create(dataOrUri, this.opts);
  }
  register(id, data:any) {
    data.id = jr.normalizeUri(id);
    if (!this.opts.store) {
      this.opts.store = {};
    }
    this.opts.store[data.id] = data;
  }
}
