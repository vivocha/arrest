import * as debug from 'debug';

export interface Logger {
  log: debug.IDebugger;
  warn: debug.IDebugger;
  error: debug.IDebugger;
  debug: debug.IDebugger;
}

let reqId = 0;
export function contextLogger(label: string): Logger {
  let id = ++reqId;
  let d = function(label:string): debug.IDebugger {
    let origDebugger:debug.IDebugger = debug(label);
    let wrappedDebugger:debug.IDebugger = <debug.IDebugger>function(formatter: string, ...args: any[]) {
      origDebugger(`req-${id} ${formatter}`, ...args);
    };
    wrappedDebugger.enabled = origDebugger.enabled;
    wrappedDebugger.log = origDebugger.log;
    wrappedDebugger.namespace = origDebugger.namespace;
    return wrappedDebugger;
  };
  return {
    log: d(label + ':log'),
    warn: d(label + ':warn'),
    error: d(label + ':error'),
    debug: d(label + ':debug')
  }
}

export function Logger(label: string): Logger {
  return {
    log: debug(label + ':log'),
    warn: debug(label + ':warn'),
    error: debug(label + ':error'),
    debug: debug(label + ':debug')
  };
}
