export function cva(baseClass = "") {
  return function classVariants(options = {}) {
    return [baseClass, options.class, options.className].filter(Boolean).join(" ");
  };
}
