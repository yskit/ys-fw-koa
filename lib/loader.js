const fs = require('fs');
const path = require('path');
const utils = require('ys-utils');
const { FileLoader, ContextLoader } = require('ys-loader');

module.exports = class Loader {
  constructor(koa, cwd, originalPrototypes) {
    this.app = koa.app;
    this.koa = koa;
    this.cwd = cwd;
    this.logger = this.koa.logger;
    this.originalPrototypes = originalPrototypes;
    this.isPro = ['product', 'production'].indexOf(this.app.env) > -1;
    this.controller = [path.join(cwd, 'app', 'controller')];
    this.middleware = [path.join(cwd, 'app', 'middleware')];
    this.service = [path.join(cwd, 'app', 'service')];
    this.extend = {
      context: [ path.join(cwd, 'app', 'extend', 'context.js') ],
      request: [ path.join(cwd, 'app', 'extend', 'request.js') ],
      response: [ path.join(cwd, 'app', 'extend', 'response.js') ],
      application: [ path.join(cwd, 'app', 'extend', 'application.js') ],
    }
  }

  log(modal, child) {
    if (this[modal]) {
      this[modal].forEach(file => {
        this.logger.debug(`  - [${modal}] Loaded from: `, file);
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
        const fileExports = utils.file.load(file);
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
          this.logger.info('merge %j to %s from %s', Object.keys(fileExports), name, file);
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