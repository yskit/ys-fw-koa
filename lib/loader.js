const fs = require('fs');
const path = require('path');
const utils = require('ys-utils');
const { FileLoader, ContextLoader } = require('ys-loader');
const debug = require('debug')('fw-koa:loader');
const is = require('is-type-of');
const utility = require('utility');

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
      initializer: (obj, opt) => {
        if (is.function(obj) && !is.generatorFunction(obj) && !is.class(obj) && !is.asyncFunction(obj)) {
          obj = obj(this.app);
        }
        if (is.class(obj)) {
          obj.prototype.pathName = opt.pathName;
          obj.prototype.fullPath = opt.path;
          return wrapClass(obj);
        }
        if (is.object(obj)) {
          return wrapObject(obj, opt.path);
        }
        // support generatorFunction for forward compatbility
        if (is.generatorFunction(obj) || is.asyncFunction(obj)) {
          return wrapObject({ 'module.exports': obj }, opt.path)['module.exports'];
        }
        return obj;
      }
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
};

// wrap the class, yield a object with middlewares
function wrapClass(Controller) {
  let proto = Controller.prototype;
  const ret = {};
  // tracing the prototype chain
  while (proto !== Object.prototype) {
    const keys = Object.getOwnPropertyNames(proto);
    for (const key of keys) {
      // getOwnPropertyNames will return constructor
      // that should be ignored
      if (key === 'constructor') {
        continue;
      }
      // skip getter, setter & non-function properties
      const d = Object.getOwnPropertyDescriptor(proto, key);
      // prevent to override sub method
      if (is.function(d.value) && !ret.hasOwnProperty(key)) {
        ret[key] = methodToMiddleware(Controller, key);
        ret[key].FULLPATH = Controller.prototype.fullPath + '#' + Controller.name + '.' + key + '()';
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return ret;
  
  function methodToMiddleware(Controller, key) {
    return function classControllerMiddleware(ctx, next) {
      console.log(ctx, next);
      const controller = new Controller(ctx);
      return controller[key].call(controller, ctx, next);
    };
  }
}

// wrap the method of the object, method can receive ctx as it's first argument
function wrapObject(obj, path, prefix) {
  const keys = Object.keys(obj);
  const ret = {};
  for (const key of keys) {
    if (is.function(obj[key])) {
      const names = utility.getParamNames(obj[key]);
      if (names[0] === 'next') {
        throw new Error(`controller \`${prefix || ''}${key}\` should not use next as argument from file ${path}`);
      }
      ret[key] = functionToMiddleware(obj[key]);
      ret[key].FULLPATH = `${path}#${prefix || ''}${key}()`;
    } else if (is.object(obj[key])) {
      ret[key] = wrapObject(obj[key], path, `${prefix || ''}${key}.`);
    }
  }
  return ret;
  
  function functionToMiddleware(func) {
    const objectControllerMiddleware = async function(ctx, next) {
      return func.call(ctx, ctx, next);
    };
    for (const key in func) {
      objectControllerMiddleware[key] = func[key];
    }
    return objectControllerMiddleware;
  }
}