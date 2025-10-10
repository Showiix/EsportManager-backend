import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middlewares/errorHandler';
import { notFoundHandler } from '@/middlewares/notFoundHandler';
import routes from '@/routes';

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // 安全中间件
    this.app.use(helmet());

    // CORS配置
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // 请求日志
    this.app.use(morgan('combined', {
      stream: { write: (message: string) => logger.info(message.trim()) }
    }));

    // 压缩响应
    this.app.use(compression());

    // 解析请求体
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 限流中间件
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 100, // 每个IP最多100个请求
      message: {
        error: 'Too many requests from this IP, please try again later.'
      }
    });
    this.app.use('/api', limiter);

    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env
      });
    });
  }

  private initializeRoutes(): void {
    // API路由前缀
    this.app.use('/api', routes);

    // 根路径
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        message: 'Esports Simulator API',
        version: '1.0.0',
        documentation: '/api/docs'
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404处理
    this.app.use(notFoundHandler);

    // 错误处理
    this.app.use(errorHandler);
  }

  public listen(): void {
    const port = config.port;
    this.app.listen(port, () => {
      logger.info(`🚀 Server running on port ${port} in ${config.env} mode`);
      logger.info(`📊 Health check available at http://localhost:${port}/health`);
      logger.info(`📖 API documentation at http://localhost:${port}/api/docs`);
    });
  }
}

export default App;