const fs = require('fs');
const path = require('path');
const utils = require('ys-utils');
const Loader = require('./loader');
const AgentService = require('ys-agent-service');
const Router = require('ys-middleware-router');

const toString = Object.prototype.toString;
const originalPrototypes = {
  request: require('ys-agent-service/lib/request'),
  response: require('ys-agent-service/lib/response'),
  context: require('ys-agent-service/lib/context'),
  application: require('ys-agent-service/index'),
}

module.exports = class Agent extends AgentService {
  constructor(app) {
    super(app);
    this.app = app;
    app.server = this;
    this.logger = this.app.console;
    this.loader = new Loader(app, this, app.options.baseDir, originalPrototypes);
    this.context.error = (...args) => this.error(...args);
  }

  error(message, code) {
    let err;
    if (isError(message)) {
      err = message;
    } else {
      err = new Error(message);
    }
    if (code) err.code = code;
    return err;
  }

  createServer(callback) {
    this.createServiceHandle = callback;
  }

  async destroy() {
    await this.app.emit('serverWillStop', this);
    this.close();
    await this.app.emit('serverDidStoped', this);
  }

  async loadFiles(cwd, dir, router) {
    this.loader.controller.push(path.join(cwd, dir, 'controller'));
    this.loader.middleware.push(path.join(cwd, dir, 'middleware'));
    this.loader.service.push(path.join(cwd, dir, 'service'));
    this.loader.extend.context.push(path.join(cwd, dir, 'extend', 'context.js'));
    this.loader.extend.request.push(path.join(cwd, dir, 'extend', 'request.js'));
    this.loader.extend.response.push(path.join(cwd, dir, 'extend', 'response.js'));
    this.loader.extend.application.push(path.join(cwd, dir, 'extend', 'application.js'));
  }

  loadAll() {
    this.loader.loadController();
    this.loader.loadMiddleware();
    this.loader.loadService();
    this.loader.loadApplicationExtend();
    this.loader.loadRequestExtend();
    this.loader.loadResponseExtend();
    this.loader.loadContextExtend();
  }

  async loadRouter(cwd, dir, router) {
    const routerFile = path.resolve(cwd, dir, 'router.js');
    if (fs.existsSync(routerFile)) {
      const routerExports = utils.file.load(routerFile);
      if (typeof routerExports === 'function') {
        await routerExports(this.app, router);
      }
    }
  }

  async created() {
    await this.app.emit('beforeLoadFiles', this.loader);
    const router = new Router();
    const routes = [];
    // 加载项目文件
    await this.loadFiles(this.app.options.baseDir, 'agent', router);
    routes.push([this.app.options.baseDir, 'agent']);

    // 加载插件文件
    for (const pluginName in this.app.plugins) {
      routes.push([this.app.plugins[pluginName].dir, 'agent']);
      await this.loadFiles(
        this.app.plugins[pluginName].dir, 
        'agent',
        router
      );
    }

    // 加载所有loader
    this.loadAll();

    for (let i = 0, j = routes.length; i < j; i++) {
      await this.loadRouter(...routes[i], router);
    }

    await this.app.emit('serverWillStart', this);
    this.use(router.routes());
    this.createServer(this.callback());
    await this.app.emit('serverDidStarted', this);
  }

  async serverRequest(req, res) {
    if (this.createServiceHandle) {
      await this.createServiceHandle(req, res);
    }
  }
}

function isError(message) {
  return message instanceof Error || toString.call(message) === '[object Error]';
}