// A small stand-in for the extension's Logger: warnings and errors print, the rest stays quiet.
class Logger {
  constructor(private prefix = "") {}
  info(..._args: unknown[]) {}
  debug(..._args: unknown[]) {}
  warn(...args: unknown[]) {
    console.warn(`(${this.prefix})`, ...args);
  }
  error(...args: unknown[]) {
    console.error(`(${this.prefix})`, ...args);
  }
}
export default Logger;
