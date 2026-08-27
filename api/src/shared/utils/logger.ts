import winston from 'winston';
import { appConfig } from '../../config/index.js';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const rest = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  const base = `${ts as string} [${level}] ${message as string}${rest}`;
  return stack ? `${base}\n${stack as string}` : base;
});

export const logger = winston.createLogger({
  level: appConfig.logLevel,
  defaultMeta: { service: 'auraai-backend' },
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new winston.transports.Console({
      format: appConfig.isProduction
        ? combine(timestamp(), errors({ stack: true }), json())
        : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), consoleFormat),
    }),
  ],
});
