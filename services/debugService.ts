type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'api' | 'socket' | 'game';

interface LogEntry {
  timestamp: string;
  type: LogLevel;
  message: any;
}

type LogListener = (log: LogEntry) => void;

class DebugService {
  private listeners: LogListener[] = [];

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
    this.listeners.forEach(listener => listener(logEntry));
    
    // Also log to the browser console for good measure
    switch (type) {
      case 'error':
        console.error(`[DEBUG]`, message);
        break;
      case 'warn':
        console.warn(`[DEBUG]`, message);
        break;
      default:
        console.log(`[DEBUG] ${type.toUpperCase()}:`, message);
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

export const debugService = new DebugService();
