import dotenv from 'dotenv';

dotenv.config();

interface Config {
  env: string;
  port: number;
  cors: {
    origin: string[];
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl: boolean;
    connectionString?: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    url?: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  logging: {
    level: string;
  };
}

export const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  },

  database: {
    // Railway 提供 DATABASE_URL，优先使用
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
    username: process.env.DB_USERNAME || process.env.PGUSER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
    database: process.env.DB_NAME || process.env.PGDATABASE || 'esports_simulator',
    // 生产环境自动启用 SSL
    ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production',
  },

  redis: {
    // Railway 提供 REDIS_URL，优先使用
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
