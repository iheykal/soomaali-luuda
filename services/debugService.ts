type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'api' | 'socket' | 'game';

interface LogEntry {
  timestamp: string;
  type: LogLevel;
  message: any;
}

type LogListener = (log: LogEntry) => void;

class DebugService {
  private listeners: LogListener[] = [];
  private static nativeConsole: Console;

  public subscribe(listener: LogListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private log(type: LogLevel, message: any) {
    const logEntry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };

    // Notify listeners asynchronously to avoid React's "Cannot update a component while rendering a different component" warning.
    // This is necessary because debug logs may be triggered from within reducers during the render phase.
    queueMicrotask(() => {
      this.listeners.forEach(listener => listener(logEntry));
    });

    // Also log to the browser console for good measure.
    // ...
    // Use the original/native console methods captured at module load
    // to avoid recursion when the app overrides console.* (e.g. to forward logs to this service).
    const nativeConsole = DebugService.nativeConsole;
    switch (type) {
      case 'error':
        nativeConsole.error(`[DEBUG]`, message);
        break;
      case 'warn':
        nativeConsole.warn(`[DEBUG]`, message);
        break;
      default:
        nativeConsole.log(`[DEBUG] ${type.toUpperCase()}:`, message);
        break;
    }
  }

  public info(message: any) {
    this.log('info', message);
  }

  public error(message: any) {
    this.log('error', message);
  }

  public warn(message: any) {
    this.log('warn', message);
  }

  public api(message: any) {
    this.log('api', message);
  }

  public socket(message: any) {
    this.log('socket', message);
  }

  public game(message: any) {
    this.log('game', message);
  }
}

// Static holder to capture original console methods once (safe to export)
(function captureNativeConsole() {
  // Bind original console methods to avoid context issues
  (DebugService as any).nativeConsole = {
    log: console.log.bind(console),
    info: console.info ? console.info.bind(console) : console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
})();

export const debugService = new DebugService();