import * as request from 'request';
import * as jr from 'jsonref';
import * as jp from 'jsonpolice';

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
          reject(response.statusCode);
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
}
