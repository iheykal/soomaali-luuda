import React, { useState, useEffect, useCallback } from 'react';
import { debugService } from '../services/debugService';

const DebugConsole = () => {
  const [logs, setLogs] = useState([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const unsubscribe = debugService.subscribe(log => {
      setLogs(prevLogs => [log, ...prevLogs]);
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribe();
    };
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const getLogColor = (type) => {
    switch (type) {
      case 'error':
        return 'red';
      case 'warn':
        return 'yellow';
      case 'api':
        return 'cyan';
      case 'socket':
        return '#88dd88'; // light green
      case 'game':
        return '#ffb86c'; // orange
      default:
        return 'white';
    }
  }

  if (!isVisible) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      left: '10px',
      right: '10px',
      height: '300px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      fontSize: '14px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Debug Console (Ctrl+Shift+D)</h3>
        <button onClick={clearLogs} style={{ padding: '5px 10px' }}>Clear</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '5px', border: '1px solid #555' }}>
        {logs.map((log, index) => (
          <div key={index} style={{ marginBottom: '5px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
            <span style={{ color: getLogColor(log.type) }}>
              [{log.timestamp}] [{log.type.toUpperCase()}]
            </span>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, paddingLeft: '10px' }}>
              {typeof log.message === 'string' ? log.message : JSON.stringify(log.message, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DebugConsole;
