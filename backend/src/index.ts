import 'reflect-metadata';
import dotenv from 'dotenv';
import App from './app';
import { logger } from '@/utils/logger';
import { connectDatabase } from '@/config/database';
import { connectRedis } from '@/config/redis';

// 加载环境变量
dotenv.config();

async function bootstrap() {
  try {
    logger.info('🚀 Starting Esports Simulator Backend...');

    // 连接数据库
    await connectDatabase();
    logger.info('✅ Database connected successfully');

    // 连接Redis
    await connectRedis();
    logger.info('✅ Redis connected successfully');

    // 启动Express应用
    const app = new App();
    app.listen();

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// 优雅关闭处理
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// 启动应用
bootstrap();