// =================================================================
// 电竞赛事模拟系统 - 数据库服务
// =================================================================

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      ssl: config.database.ssl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    this.pool.on('error', (err) => {
      logger.error('Database pool error:', err);
    });
  }

  // 执行查询
  async query(text: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug('Database query executed', {
        query: text,
        duration: `${duration}ms`,
        rows: result.rowCount
      });

      return result;
    } catch (error) {
      logger.error('Database query error:', {
        query: text,
        params,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // 获取连接
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  // 事务执行
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 关闭连接池
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows[0]?.health === 1;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

// 单例数据库服务
export const databaseService = new DatabaseService();