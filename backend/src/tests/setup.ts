// 测试环境设置
import { logger } from '@/utils/logger';

// 设置测试环境
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// 全局测试配置
beforeAll(async () => {
  logger.info('Setting up test environment...');
});

afterAll(async () => {
  logger.info('Tearing down test environment...');
});

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
});
