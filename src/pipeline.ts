import { Operation } from './operation';
import { Resource } from './resource';
import { APIRequest, APIResponse, Method } from './types';
import { CSVOptions, toCSV } from './util';

export interface Job {
  req: APIRequest;
  res: APIResponse;
  query?: any;
  doc?: any;
  opts?: any;
  data?: any;
  feat?: {
    filter?: {
      fields: boolean;
      data: boolean;
    };
    format?:
      | {
          type: 'json';
        }
      | ({
          type: 'csv';
          filename?: string;
        } & CSVOptions);
  };
}

export abstract class PipelineOperation extends Operation {
  async createJob(req: APIRequest, res: APIResponse): Promise<Job> {
    const out: Job = {
      req,
      res,
      query: {},
      opts: {},
      feat: {
        filter: {
          fields: true,
          data: true,
        },
      },
    };
    if (req.query.format === 'csv' && req.query.csv_fields?.length) {
      const opts: CSVOptions = {
        fields: req.query.csv_fields,
        ...((req.query.csv_options as any) || {}),
      };
      if (req.query.csv_names?.length === opts.fields.length) {
        opts.fields = (opts.fields as string[]).reduce((o, i, idx) => {
          o[i] = req.query.csv_names![idx];
          return o;
        }, {}) as any;
      }
      out.feat!.format = {
        ...opts,
        type: 'csv',
      };
    }
    return out;
  }
  async prepareQuery(job: Job): Promise<Job> {
    return job;
  }
  async prepareDoc(job: Job): Promise<Job> {
    return job;
  }
  async prepareOpts(job: Job): Promise<Job> {
    return job;
  }
  abstract runOperation(job: Job): Promise<Job>;
  async redactResult(job: Job): Promise<Job> {
    if (job.req.ability && job.data && typeof job.data === 'object' && (job.feat?.filter?.fields || job.feat?.filter?.data)) {
      job.data = this.checkAbility(job.req.ability, job.data, job.feat.filter.fields, job.feat.filter.data);
    }
    return job;
  }
  async processResult(job: Job): Promise<Job> {
    if (job.data) {
      if (job.feat?.format?.type === 'csv' && Array.isArray(job.data)) {
        job.data = toCSV(job.data, job.feat.format);
        job.res.setHeader('content-type', 'text/csv');
        if (job.feat.format.filename) {
          job.res.setHeader('content-disposition', `attachment; filename=\"${job.feat.format.filename}\"`);
        }
        job.res.send(job.data);
      } else {
        job.res.jsonp(job.data);
      }
    } else {
      job.res.end();
    }
    return job;
  }

  async handler(req: APIRequest, res: APIResponse) {
    try {
      const job: Job = await this.createJob(req, res);
      await this.prepareQuery(job);
      await this.prepareDoc(job);
      await this.prepareOpts(job);
      req.logger.debug(this.info.operationId, 'query', JSON.stringify(job.query, null, 2));
      req.logger.debug(this.info.operationId, 'doc', JSON.stringify(job.doc, null, 2));
      req.logger.debug(this.info.operationId, 'opts', JSON.stringify(job.opts, null, 2));
      await this.runOperation(job);
      await this.redactResult(job);
      await this.processResult(job);
    } catch (err) {
      this.api.handleError(err, req, res);
    }
  }
}

export interface PipelineOperationRunner {
  (job: Job): Promise<Job>;
}

export class SimplePipelineOperation extends PipelineOperation {
  constructor(protected customRunner: PipelineOperationRunner, resource: Resource, path: string, method: Method, id?: string) {
    super(resource, path, method, id);
  }
  runOperation(job: Job): Promise<Job> {
    return this.customRunner(job);
  }
}
