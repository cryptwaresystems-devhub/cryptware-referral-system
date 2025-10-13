import chalk from 'chalk';

// Color-coded logging utility for better readability
class Logger {
  static info(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(
      chalk.blue(`[${timestamp}]`) + chalk.green(' INFO: ') + message,
      data ? chalk.gray(JSON.stringify(data, null, 2)) : ''
    );
  }

  static error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(
      chalk.blue(`[${timestamp}]`) + chalk.red(' ERROR: ') + message,
      error ? chalk.red(error.stack || error) : ''
    );
  }

  static warn(message, data = null) {
    const timestamp = new Date().toISOString();
    console.warn(
      chalk.blue(`[${timestamp}]`) + chalk.yellow(' WARN: ') + message,
      data ? chalk.yellow(JSON.stringify(data, null, 2)) : ''
    );
  }

  static debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      console.debug(
        chalk.blue(`[${timestamp}]`) + chalk.magenta(' DEBUG: ') + message,
        data ? chalk.magenta(JSON.stringify(data, null, 2)) : ''
      );
    }
  }

  static success(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(
      chalk.blue(`[${timestamp}]`) + chalk.green(' SUCCESS: ') + message,
      data ? chalk.green(JSON.stringify(data, null, 2)) : ''
    );
  }

  static request(method, path, status, duration, ip) {
    const timestamp = new Date().toISOString();
    const statusColor = status >= 400 ? chalk.red : status >= 300 ? chalk.yellow : chalk.green;
    
    console.log(
      chalk.blue(`[${timestamp}]`) +
      chalk.cyan(` ${method} `) +
      chalk.white(path) +
      statusColor(` ${status} `) +
      chalk.gray(`${duration}ms`) +
      chalk.gray(` - ${ip}`)
    );
  }

  static database(operation, table, duration, success = true) {
    const timestamp = new Date().toISOString();
    const status = success ? chalk.green('✓') : chalk.red('✗');
    
    console.log(
      chalk.blue(`[${timestamp}]`) +
      chalk.cyan(' DATABASE: ') +
      status +
      chalk.white(` ${operation} on ${table} `) +
      chalk.gray(`(${duration}ms)`)
    );
  }
}

export default Logger;