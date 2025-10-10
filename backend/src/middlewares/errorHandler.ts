import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { statusCode = 500, message, stack } = error;

  logger.error('Error occurred:', {
    error: message,
    statusCode,
    stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  const errorResponse = {
    success: false,
    error: {
      code: statusCode,
      message: statusCode === 500 ? 'Internal Server Error' : message
    },
    ...(process.env.NODE_ENV === 'development' && { stack })
  };

  res.status(statusCode).json(errorResponse);
};