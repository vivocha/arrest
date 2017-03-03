import * as debug from 'debug';

export interface Logger {
  log: debug.IDebugger;
  warn: debug.IDebugger;
  error: debug.IDebugger;
  debug: debug.IDebugger;
}

export default function(label: string): Logger {
  return {
    log: debug(label + ':log'),
    warn: debug(label + ':warn'),
    error: debug(label + ':error'),
    debug: debug(label + ':debug')
  };
}
