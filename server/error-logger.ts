import { storage } from "./storage";
import { logger } from "./logger";
import { InsertErrorLog } from "@shared/schema";
import type { Request, Response } from "express";

export class ErrorLogger {
  /**
   * Log an error with comprehensive context information
   */
  static async log(options: {
    errorType: string;
    errorMessage: string;
    error?: Error;
    userId?: string;
    sessionId?: string;
    req?: Request;
    res?: Response;
    errorCode?: string;
    additionalDetails?: any;
  }): Promise<void> {
    try {
      // Extract request information if available
      const requestInfo = options.req ? {
        route: options.req.path,
        method: options.req.method,
        userAgent: options.req.get('User-Agent'),
        ipAddress: options.req.ip || options.req.connection.remoteAddress,
        requestData: this.sanitizeRequestData(options.req)
      } : {};

      // Build error log entry
      const errorLogData: InsertErrorLog = {
        userId: options.userId || null,
        sessionId: options.sessionId || null,
        errorType: options.errorType,
        errorMessage: options.errorMessage,
        errorCode: options.errorCode || (options.res?.statusCode?.toString()),
        ...requestInfo,
        stackTrace: options.error?.stack || null,
        errorDetails: {
          originalError: options.error ? {
            name: options.error.name,
            message: options.error.message,
          } : null,
          ...options.additionalDetails,
          timestamp: new Date().toISOString()
        }
      };

      // Log to database
      await storage.logError(errorLogData);
      
      // Also log to console for immediate debugging
      logger.error(`🚨 [${options.errorType.toUpperCase()}] ${options.errorMessage}`, {
        userId: options.userId,
        error: options.error?.message,
        details: options.additionalDetails
      });

    } catch (loggingError) {
      // Don't let error logging crash the application
      logger.error('Failed to log error to database:', loggingError);
      logger.error('Original error being logged:', options.errorMessage, options.error);
    }
  }

  /**
   * Log generation-related errors
   */
  static async logGenerationError(
    message: string, 
    error?: Error, 
    userId?: string, 
    generationId?: string,
    req?: Request
  ): Promise<void> {
    await this.log({
      errorType: 'generation',
      errorMessage: message,
      error,
      userId,
      req,
      additionalDetails: { generationId }
    });
  }

  /**
   * Log API-related errors (CivitAI, external services)
   */
  static async logAPIError(
    message: string,
    error?: Error,
    userId?: string,
    apiService?: string,
    req?: Request
  ): Promise<void> {
    await this.log({
      errorType: 'api',
      errorMessage: message,
      error,
      userId,
      req,
      additionalDetails: { apiService }
    });
  }

  /**
   * Log authentication errors
   */
  static async logAuthError(
    message: string,
    error?: Error,
    userId?: string,
    req?: Request
  ): Promise<void> {
    await this.log({
      errorType: 'authentication',
      errorMessage: message,
      error,
      userId,
      req
    });
  }

  /**
   * Log database-related errors
   */
  static async logDatabaseError(
    message: string,
    error?: Error,
    userId?: string,
    operation?: string,
    req?: Request
  ): Promise<void> {
    await this.log({
      errorType: 'database',
      errorMessage: message,
      error,
      userId,
      req,
      additionalDetails: { operation }
    });
  }

  /**
   * Log validation errors
   */
  static async logValidationError(
    message: string,
    validationErrors?: any,
    userId?: string,
    req?: Request
  ): Promise<void> {
    await this.log({
      errorType: 'validation',
      errorMessage: message,
      userId,
      req,
      additionalDetails: { validationErrors }
    });
  }

  /**
   * Log system/server errors
   */
  static async logSystemError(
    message: string,
    error?: Error,
    component?: string,
    req?: Request
  ): Promise<void> {
    await this.log({
      errorType: 'system',
      errorMessage: message,
      error,
      req,
      additionalDetails: { component }
    });
  }

  /**
   * Sanitize request data to remove sensitive information
   */
  private static sanitizeRequestData(req: Request): any {
    const requestData: any = {
      params: req.params,
      query: req.query,
      body: req.body ? { ...req.body } : null,
      headers: { ...req.headers }
    };

    // Remove sensitive data
    if (requestData.body) {
      delete requestData.body.password;
      delete requestData.body.apiKey;
      delete requestData.body.civitaiApiKey;
      delete requestData.body.token;
    }

    if (requestData.headers) {
      delete requestData.headers.authorization;
      delete requestData.headers.cookie;
      delete requestData.headers['x-api-key'];
    }

    // Limit size to prevent database bloat
    const serialized = JSON.stringify(requestData);
    if (serialized.length > 10000) { // 10KB limit
      return { 
        ...requestData,
        body: '[Request body too large to log]',
        note: 'Request data truncated due to size'
      };
    }

    return requestData;
  }
}

/**
 * Express middleware for automatic error logging
 */
export function errorLoggingMiddleware() {
  return async (error: any, req: Request, res: Response, next: any) => {
    // Extract user ID from session if available
    const userId = (req as any).user?.claims?.sub || null;
    const sessionId = (req as any).sessionID || null;

    // Determine error type based on error or response
    let errorType = 'system';
    if (res.statusCode === 401) errorType = 'authentication';
    else if (res.statusCode === 403) errorType = 'authorization';
    else if (res.statusCode === 400) errorType = 'validation';
    else if (res.statusCode >= 500) errorType = 'system';

    // Log the error
    await ErrorLogger.log({
      errorType,
      errorMessage: error.message || 'Unknown error occurred',
      error,
      userId,
      sessionId,
      req,
      res,
      errorCode: res.statusCode?.toString()
    });

    // Continue with default error handling
    next(error);
  };
}

export default ErrorLogger;