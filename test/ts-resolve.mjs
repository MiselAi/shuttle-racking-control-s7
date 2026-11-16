// Lets node:test load app modules that import siblings without a file extension (as Metro allows).
import { registerHooks } from 'node:module';
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(spec)) return next(spec + '.ts', ctx);
      throw e;
    }
  },
});
