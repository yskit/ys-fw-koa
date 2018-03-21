module.exports = class Agent {
  constructor(app) {
    this.app = app;
  }

  async created() {}
  async destroy() {}
}