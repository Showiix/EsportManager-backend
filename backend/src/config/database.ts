import { Pool, PoolClient } from 'pg';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';

class DatabaseConnection {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.username,
      password: config.database.password,
      database: config.database.database,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 20, // 最大连接数
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // 连接事件处理
    this.pool.on('connect', () => {
      logger.info('New PostgreSQL client connected');
    });

    this.pool.on('error', err => {
      logger.error('PostgreSQL pool error:', err);
    });
  }

  public async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      logger.info('PostgreSQL connected successfully');
      client.release();
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }

  public async query(text: string, params?: unknown[]): Promise<any> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      logger.error('Query error:', { text, error });
      throw error;
    }
  }

  public async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  public async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('PostgreSQL pool disconnected');
  }
}

export const db = new DatabaseConnection();

export const connectDatabase = async (): Promise<void> => {
  await db.connect();
};
