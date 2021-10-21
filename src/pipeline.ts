import { Operation } from './operation';
import { Resource } from './resource';
import { APIRequest, APIResponse, Method } from './types';

export interface Job {
  req: APIRequest;
  res: APIResponse;
  query?: any;
  doc?: any;
  opts?: any;
  data?: any;
}

export interface PipelineOptions {
  filter: {
    fields: boolean;
    data: boolean;
  };
}

export abstract class PipelineOperation extends Operation {
  get options(): PipelineOptions {
    return {
      filter: {
        fields: true,
        data: true,
      },
    };
  }
  async createJob(req: APIRequest, res: APIResponse): Promise<Job> {
    return { req, res, query: {}, opts: {} };
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
    if (job.req.ability && job.data && typeof job.data === 'object' && (this.options.filter.fields || this.options.filter.data)) {
      job.data = this.checkAbility(job.req.ability, job.data, this.options.filter.fields, this.options.filter.data);
    }
    return job;
  }
  async processResult(job: Job): Promise<Job> {
    if (job.data) {
      job.res.jsonp(job.data);
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
