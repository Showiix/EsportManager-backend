import { createClient, RedisClientType } from 'redis';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';

class RedisConnection {
  private client: RedisClientType;

  constructor() {
    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    // Redis事件处理
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', err => {
      logger.error('Redis client error:', err);
    });

    this.client.on('end', () => {
      logger.info('Redis client disconnected');
    });
  }

  public async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await this.client.disconnect();
    logger.info('Redis disconnected');
  }

  // 缓存操作方法
  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET error:', { key, error });
      return null;
    }
  }

  public async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error('Redis SET error:', { key, error });
      throw error;
    }
  }

  public async del(...keys: string[]): Promise<void> {
    try {
      await this.client.del(keys);
    } catch (error) {
      logger.error('Redis DEL error:', { keys, error });
      throw error;
    }
  }

  public async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS error:', { pattern, error });
      return [];
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error });
      return false;
    }
  }

  public async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      logger.error('Redis invalidate pattern error:', { pattern, error });
      throw error;
    }
  }

  public getClient(): RedisClientType {
    return this.client;
  }
}

export const redis = new RedisConnection();
export const redisService = redis;

export const connectRedis = async (): Promise<void> => {
  await redis.connect();
};
