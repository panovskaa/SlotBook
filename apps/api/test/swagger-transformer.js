/**
 * Runs the @nestjs/swagger compiler plugin inside ts-jest, so tests see the same API docs that
 * `nest build` produces. ts-jest needs this name/version/factory wrapper around the plugin.
 */
const plugin = require('@nestjs/swagger/plugin');

module.exports.name = 'nestjs-swagger-transformer';
module.exports.version = 1;
module.exports.factory = (tsCompiler) =>
  plugin.before({ classValidatorShim: true, introspectComments: true }, tsCompiler.program);
