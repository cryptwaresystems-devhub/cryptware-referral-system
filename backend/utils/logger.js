// Simple logging utility
class Logger {
    static info(message, data = null) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] INFO: ${message}`, data ? JSON.stringify(data) : '');
    }
  
    static error(message, error = null) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] ERROR: ${message}`, error ? error.stack || error : '');
    }
  
    static warn(message, data = null) {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] WARN: ${message}`, data ? JSON.stringify(data) : '');
    }
  
    static debug(message, data = null) {
      if (process.env.NODE_ENV === 'development') {
        const timestamp = new Date().toISOString();
        console.debug(`[${timestamp}] DEBUG: ${message}`, data ? JSON.stringify(data) : '');
      }
    }
  }
  
  module.exports = Logger;