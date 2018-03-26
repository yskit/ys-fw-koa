const fs = require('fs');
const path = require('path');
const utils = require('ys-utils');
const Router = require('ys-middleware-router');
const { FileLoader, ContextLoader } = require('ys-loader');
const Loader = require('./loader');
const originalPrototypes = {
  request: require('ys-mutify/lib/agent_request'),
  response: require('ys-mutify/lib/agent_response'),
  context: require('ys-mutify/lib/agent_context'),
  application: require('ys-mutify/lib/agent_plugin'),
}

module.exports = class Agent {
  constructor(app) {
    this.app = app;
  }

  async loadAgentRouter(component) {
    const router = new Router();
    const routerFile = path.resolve(component.cwd, 'agent', 'router.js');
    if (fs.existsSync(routerFile)) {
      const routerExports = utils.file.load(routerFile);
      if (routerExports) {
        await routerExports(component, router);
      }
    }
    component.router = router;
  }

  async component(component) {
    const loader = new Loader(component, component, component.cwd, originalPrototypes);
    loader.controller.push(path.resolve(component.cwd, 'agent', 'controller'));
    loader.middleware.push(path.resolve(component.cwd, 'agent', 'middleware'));
    loader.service.push(
      path.resolve(component.cwd, 'agent', 'service'),
      path.resolve(this.app.options.baseDir, 'app', 'service')
    );
    loader.extend.context.push(path.join(component.cwd, 'agent', 'extend', 'context.js'));
    loader.extend.request.push(path.join(component.cwd, 'agent', 'extend', 'request.js'));
    loader.extend.response.push(path.join(component.cwd, 'agent', 'extend', 'response.js'));
    loader.extend.application.push(path.join(component.cwd, 'agent', 'extend', 'application.js'));

    loader.loadController();
    loader.loadMiddleware();
    loader.loadService();
    loader.loadApplicationExtend();
    loader.loadRequestExtend();
    loader.loadResponseExtend();
    loader.loadContextExtend();
    
    await this.loadAgentRouter(component);
    component.use(component.router.routes());
  }

  async created() {}
  async destroy() {}
}