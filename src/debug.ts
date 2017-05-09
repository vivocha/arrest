import * as debug from 'debug';

export interface Logger {
  log: debug.IDebugger;
  info: debug.IDebugger;
  warn: debug.IDebugger;
  error: debug.IDebugger;
  debug: debug.IDebugger;
}

export function createLogger(label: string, context?: string): Logger {
  let d = context ? function(label:string): debug.IDebugger {
    let origDebugger:debug.IDebugger = debug(label);
    let wrappedDebugger:debug.IDebugger = <debug.IDebugger>function(formatter: string, ...args: any[]) {
      origDebugger(`${context} ${formatter}`, ...args);
    };
    wrappedDebugger.enabled = origDebugger.enabled;
    wrappedDebugger.log = origDebugger.log;
    wrappedDebugger.namespace = origDebugger.namespace;
    return wrappedDebugger;
  } : debug;
  return {
    log: d(label + ':log'),
    info: d(label + ':info'),
    warn: d(label + ':warn'),
    error: d(label + ':error'),
    debug: d(label + ':debug')
  }
}
