const fs = require('fs');
const Loader = require('./loader');
const Koa = require('koa');
const path = require('path');
const http = require('http');
const https = require('https');
const request = require('request');
const KeyGrip = require('keygrip');
const staticCache = require('koa-static-cache')
const toString = Object.prototype.toString;

const originalPrototypes = {
  request: require('koa/lib/request'),
  response: require('koa/lib/response'),
  context: require('koa/lib/context'),
  application: require('koa/lib/application'),
};

module.exports = class Application extends Koa {
  constructor(app) {
    super();
    this.app = app;
    app.koa = this;
    this.callbackId = 1;
    this.callbacks = {};
    this.logger = this.app.console;
    this.curl = this.context.curl = request;
    this.loader = new Loader(app, this, app.options.baseDir, originalPrototypes);
    this.context.error = (...args) => this.error(...args);
    this.context.fetch = (...args) => this.fetch(...args);
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

  async fetch(options = {}) {
    if (typeof options === 'string') options = { url: options };
    if (!options.url) throw this.error('Fetch method miss url param.');
    const exec = /^ipc:\/\/([^\/]+)(.+)?$/.exec(options.url);
    if (!exec) throw this.error('Fetch methods format Error: ipc://{Agent}/{router}');
    const agent = exec[1];
    const uri = exec[2] ? exec[2] : '/';
    return new Promise((resolve, reject) => {
      const time = new Date().getTime();
      const id = this.callbackId++;
      const timeout = options.timeout || this.app.options.fetch_default_timeout;
      const timer = setInterval(() => {
        if (new Date().getTime() - time > (options.fetch_default_timeout || 30000)) {
          delete this.callbacks[id];
          clearInterval(timer);
          reject(this.error('Application Fetching Timeout'));
        }
      }, 10);
      this.callbacks[id] = (err, data) => {
        delete this.callbacks[id];
        clearInterval(timer);
        if (err) return reject(err);
        resolve(data);
      }
      this.app.send(agent, uri, {
        ipc_service_data: options.data || {},
        ipc_service_callback_id: id
      });
    })
  }

  async createServer(callback) {
    const options = this.app.options;
    const netWork = options.https ? https : http;
    const _port = (options.service ? options.service.port : null) || 
                  (options.server ? options.server.port : null) || 
                  options.port;
    const port = options.socket ? options.clusterPort : _port;
    const httpOptions = [];
    if (options.https) {
      httpOptions.push(options.https);
    }
    httpOptions.push(callback);
    this.server = netWork.createServer(...httpOptions);
    await new Promise((resolve, reject) => {
      this.server.listen(port, err => {
        if (err) return reject(err);
        this.app.console.info(`+ '${options.https ? 'https' : 'http'}://127.0.0.1:${port}'`);
        resolve();
      });
    });
  }

  async message(message) {
    if (typeof message.action === 'number') {
      const callback = this.callbacks[message.action];
      if (!callback) return;
      if (message.body.error) {
        return callback(this.error(message.body.error));
      }
      return callback(null, message.body);
    }

    return await this.app.emit(message.action, message.body);
  }

  loadFiles(cwd, dir) {
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

  async created() {
    await this.app.emit('beforeLoadFiles', this.loader);
    this.loadFiles(this.app.options.baseDir, 'app');
    await this.app.plugin.each(async service => this.loadFiles(service.dir, 'app'));
    this.loadAll();

    const publicPath = path.resolve(this.app.options.baseDir, 'app', 'public');
    if (fs.existsSync(publicPath)) {
      this.use(
        staticCache(
          path.resolve(this.app.options.baseDir, 'app', 'public'), 
          // options: https://www.npmjs.com/package/koa-static-cache#api
          Object.assign({
            maxAge: 365 * 24 * 60 * 60,
            gzip: true
          }, this.app.options.static || {})
        )
      );
    }

    await this.app.emit('serverWillStart', this);
    this.keys = new KeyGrip(this.app.options.cookie.keys, this.app.options.cookie.type);
    await this.app.emit('serverRouterWrapped', this);
    await this.createServer(this.callback());
    await this.app.emit('serverDidStarted', this);
  }

  async destroy() {
    if (this.server) {
      await this.app.emit('serverWillStop', this);
      this.server.close();
      await this.app.emit('serverDidStoped', this);
    }
  }
};

function isError(message) {
  return message instanceof Error || toString.call(message) === '[object Error]';
}