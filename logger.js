/**
 * نظام تسجيل موحّد — مستويات واضحة بدون إغراق الإنتاج
 * error/warn تظهر دائمًا؛ info/debug فقط عند تفعيل window.__DEBUG
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function enabled(level) {
  if (level === "error" || level === "warn") return true;
  try {
    if (window.__DEBUG === true) return true;
    if (localStorage.getItem("eltafawoq_debug") === "1") return true;
  } catch (_) {}
  return false;
}

function emit(level, scope, args) {
  if (!enabled(level)) return;
  const prefix = `[التفوق:${scope||"app"}]`;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  try { fn(prefix, ...args); } catch (_) {}
}

export const logger = {
  error(scope, ...args) { emit("error", scope, args); },
  warn(scope, ...args) { emit("warn", scope, args); },
  info(scope, ...args) { emit("info", scope, args); },
  debug(scope, ...args) { emit("debug", scope, args); },
  /** قياس زمن عملية */
  time(scope, label) {
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    return () => {
      const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      emit("debug", scope, [label || "timing", Math.round(t1 - t0) + "ms"]);
    };
  }
};

export default logger;
