const fs = require('fs');
const Koa = require('koa');
const path = require('path');
const http = require('http');
const https = require('https');
const request = require('request');
const Loader = require('./loader');
const { FileLoader, ContextLoader } = require('ys-loader');
const toString = Object.prototype.toString;

module.exports = class Application extends Koa {
  constructor(app) {
    super();
    this.app = app;
    app.koa = this;
    this.logger = this.app.console;
    this.context.error = (...args) => this.error(...args);
    this.curl = this.context.curl = request;
    this.loader = new Loader(this);
  }

  error(message, code) {
    let err;
    if (message instanceof Error || toString.call(message) === '[object Error]') {
      err = message;
    } else {
      err = new Error(message);
    }
    if (code) err.code = code;
    return err;
  }

  async createServer(callback) {
    const options = this.app.options;
    const netWork = options.https ? https : http;
    const _port = options.port;
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
        this.app.console.info(
          '[%d] [WORKER] Start service on `%s://%s:%d`', 
          this.app.pid, 
          options.https ? 'https' : 'http', 
          '127.0.0.1', 
          port
        );
        resolve();
      });
    });
  }

  async created() {
    await this.app.emit('beforeLoadFiles', this.loader);
    for (const pluginName in this.app.plugins) {
      const plugin = this.app.plugins[pluginName];
      const pluginAppDir = path.resolve(plugin.dir, 'app');
      if (fs.existsSync(pluginAppDir)) {
        this.loader.controller.push(path.join(pluginAppDir, 'controller'));
        this.loader.middleware.push(path.join(pluginAppDir, 'middleware'));
        this.loader.service.push(path.join(pluginAppDir, 'service'));
      }
    }
    this.loader.loadController();
    this.loader.loadMiddleware();
    this.loader.loadService();
    await this.app.emit('serverWillStart', this);
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
}