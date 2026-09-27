const { TextDecoder, TextEncoder } = require('node:util');
const { ReadableStream, TransformStream, WritableStream } = require('node:stream/web');
const { clearImmediate } = require('node:timers');
const { performance } = require('node:perf_hooks');
const { MessageChannel, MessagePort, BroadcastChannel } = require('node:worker_threads');

const defineGlobal = (key, val) => {
  Object.defineProperty(globalThis, key, {
    value: val,
    writable: true,
    configurable: true,
  });
};

defineGlobal('TextDecoder', TextDecoder);
defineGlobal('TextEncoder', TextEncoder);
defineGlobal('ReadableStream', ReadableStream);
defineGlobal('TransformStream', TransformStream);
defineGlobal('WritableStream', WritableStream);
defineGlobal('clearImmediate', clearImmediate);
defineGlobal('performance', performance);
defineGlobal('MessagePort', MessagePort);
defineGlobal('MessageChannel', MessageChannel);
defineGlobal('BroadcastChannel', BroadcastChannel);

const { Blob, File } = require('node:buffer');
const { fetch, Headers, FormData, Request, Response } = require('undici');

defineGlobal('fetch', fetch);
defineGlobal('Blob', Blob);
defineGlobal('File', File);
defineGlobal('Headers', Headers);
defineGlobal('FormData', FormData);
defineGlobal('Request', Request);
defineGlobal('Response', Response);
