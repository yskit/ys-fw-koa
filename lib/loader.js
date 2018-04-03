const fs = require('fs');
const path = require('path');
const utils = require('ys-utils');
const { FileLoader, ContextLoader } = require('ys-loader');
const debug = require('debug')('fw-koa:loader');

module.exports = class Loader {
  constructor(app, koa, cwd, originalPrototypes) {
    this.app = app;
    this.koa = koa;
    this.cwd = cwd;
    this.originalPrototypes = originalPrototypes;
    this.logger = app.logger;
    this.isPro = ['product', 'production'].indexOf(app.env) > -1;
    this.controller = [];
    this.middleware = [];
    this.service = [];
    this.extend = {
      context: [],
      request: [],
      response: [],
      application: [],
    }
  }

  log(modal, child) {
    if (this[modal]) {
      this[modal].forEach(file => {
        debug(`  - [${modal}] Loaded from: `, file);
      });
    }
  }

  toApp(directory, property, opt = {}) {
    const target = this.app[property] = {};
    return new FileLoader(Object.assign({}, {
      directory,
      target
    }, opt)).load();
  }

  toContext(directory, property, opt = {}) {
    return new ContextLoader(Object.assign({}, {
      directory,
      property,
      inject: this.koa,
    }, opt)).load();
  }

  loadController() {
    const loadCount = this.toApp(this.controller, 'controller', {
      call: true,
      inject: this.app,
    });
    if (!this.isPro && loadCount) this.log('controller');
  }

  loadMiddleware() {
    const loadCount = this.toApp(this.middleware, 'middleware', {
      call: true,
      inject: this.app,
    });
    if (!this.isPro && loadCount) this.log('middleware');
  }

  loadService() {
    const loadCount = this.toContext(this.service, 'service', {
      call: true,
      caseStyle: 'lower',
      fieldClass: 'serviceClasses'
    });
    if (!this.isPro && loadCount) this.log('service');
  }

  loadExtend(name, proto) {
    for (let i in this.extend[name]) {
      const file = this.extend[name][i];
      if (fs.existsSync(file)) {
        let fileExports = utils.file.load(file);
        if (fileExports) {
          if (typeof fileExports === 'function') {
            fileExports = fileExports(this.app);
          }
          const mergedRecords = new Map();
          const properties = Object.getOwnPropertyNames(fileExports).concat(Object.getOwnPropertySymbols(fileExports));
          for (const property of properties) {
            if (mergedRecords.has(property)) {
              this.logger.warn('Property: "%s" already exists in "%s"，it will be redefined by "%s"',
                property, mergedRecords.get(property), file);
            }

            let descriptor = Object.getOwnPropertyDescriptor(fileExports, property);
            let originalDescriptor = Object.getOwnPropertyDescriptor(proto, property);
            if (!originalDescriptor) {
              // try to get descriptor from originalPrototypes
              const originalProto = this.originalPrototypes[name];
              if (originalProto) {
                originalDescriptor = Object.getOwnPropertyDescriptor(originalProto, property);
              }
            }
            if (originalDescriptor) {
              // don't override descriptor
              descriptor = Object.assign({}, descriptor);
              if (!descriptor.set && originalDescriptor.set) {
                descriptor.set = originalDescriptor.set;
              }
              if (!descriptor.get && originalDescriptor.get) {
                descriptor.get = originalDescriptor.get;
              }
            }
            Object.defineProperty(proto, property, descriptor);
            mergedRecords.set(property, file);
          }
          debug('merge %j to %s from %s', Object.keys(fileExports), name, file);
        }
      }
    }
  }

  loadApplicationExtend() {
    this.loadExtend('application', this.koa);
  }

  loadRequestExtend() {
    this.loadExtend('request', this.koa.request);
  }

  loadResponseExtend() {
    this.loadExtend('response', this.koa.response);
  }

  loadContextExtend() {
    this.loadExtend('context', this.koa.context);
  }
}