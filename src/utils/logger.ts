import fs from 'fs';
import path from 'path';
import winston from 'winston';

// Create logs directory if it doesn't exist
const logsDir: string = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger: winston.Logger = winston.createLogger({
  level: process.env.LOG_LEVEL?.toLowerCase() || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true })
  ),
  defaultMeta: { service: 'ai-job-hunter' },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.json(),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: winston.format.json(),
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf((info) => {
          return `${info.timestamp} [${info.level}]: ${info.message}`;
        })
      ),
    }),
  ],
});

export default logger;
