const path = require('path');
const { FileLoader, ContextLoader } = require('ys-loader');

module.exports = class Loader {
  constructor(koa) {
    this.app = koa.app;
    this.koa = koa;
    this.logger = this.koa.logger;
    this.isPro = ['product', 'production'].indexOf(this.app.env) > -1;
    this.controller = [path.join(this.app.options.baseDir, 'app', 'controller')];
    this.middleware = [path.join(this.app.options.baseDir, 'app', 'middleware')];
    this.service = [path.join(this.app.options.baseDir, 'app', 'service')];
  }

  log(modal) {
    if (this[modal]) {
      this[modal].forEach(file => {
        const relative = '{root}/' + path.relative(this.app.options.baseDir, file);
        this.logger.debug(`  - [${this.app.pid}]`, `[${modal}] Loaded from: `, relative);
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
}