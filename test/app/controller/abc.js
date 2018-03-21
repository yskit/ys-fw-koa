const base = require('../../../index').Base;
module.exports = app => {
  return async ctx => {
    ctx.body = 'ok';
  }
}