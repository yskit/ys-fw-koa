const fs = require('fs');
const path = require('path');
const utils = require('ys-utils');
const Router = require('ys-middleware-router');
const { FileLoader, ContextLoader } = require('ys-loader');

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
    // component.app = component;
    // component.logger = this.app.logger;

    // this.loadController(component);
    // this.loadMiddleware(component);
    // this.loadService(component);
    // await this.loadAgentRouter(component);
    // component.use(component.router.routes());
  }

  async created() {}
  async destroy() {}
}