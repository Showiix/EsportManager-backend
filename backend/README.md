# Esports Simulator Backend

电竞赛事模拟系统后端服务

## 项目结构

```
backend/
├── src/                    # 源代码
│   ├── config/            # 配置文件
│   ├── controllers/       # 控制器
│   ├── services/          # 业务逻辑服务
│   ├── repositories/      # 数据访问层
│   ├── models/           # 数据模型
│   ├── middlewares/      # 中间件
│   ├── utils/            # 工具函数
│   ├── types/            # TypeScript类型定义
│   ├── validators/       # 数据验证
│   ├── routes/           # 路由配置
│   ├── database/         # 数据库相关
│   │   ├── migrations/   # 数据库迁移
│   │   └── seeds/        # 种子数据
│   └── tests/            # 测试文件
│       ├── unit/         # 单元测试
│       └── integration/  # 集成测试
├── logs/                 # 日志文件
├── docs/                 # 文档
├── scripts/              # 脚本文件
├── dist/                 # 编译输出
└── node_modules/         # 依赖包
```

## 安装和运行

### 环境要求
- Node.js >= 18.0.0
- PostgreSQL >= 13
- Redis >= 6.0

### 安装依赖
```bash
npm install
```

### 环境配置
```bash
# 复制环境配置文件
cp .env.example .env

# 编辑环境变量
vim .env
```

### 数据库设置
```bash
# 创建数据库
createdb esports_simulator

# 运行数据库迁移
npm run migration:run

# 插入种子数据（可选）
npm run seed:run
```

### 运行项目
```bash
# 开发环境
npm run dev

# 生产环境
npm run build
npm start
```

## API 文档

服务启动后，访问 http://localhost:3000/api/docs 查看 API 文档

## 测试

```bash
# 运行所有测试
npm test

# 运行测试并监听文件变化
npm run test:watch

# 生成测试覆盖率报告
npm run test:coverage
```

## 代码规范

```bash
# 代码检查
npm run lint

# 自动修复代码格式
npm run lint:fix

# 格式化代码
npm run format
```

## 项目特性

- ✅ TypeScript 支持
- ✅ Express.js 框架
- ✅ PostgreSQL 数据库
- ✅ Redis 缓存
- ✅ JWT 认证
- ✅ 数据验证
- ✅ 错误处理
- ✅ 日志记录
- ✅ API 文档
- ✅ 单元测试
- ✅ Docker 支持

## 部署

使用 Docker 部署：

```bash
# 构建镜像
docker build -t esports-simulator-backend .

# 运行容器
docker run -p 3000:3000 esports-simulator-backend
```

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

MIT License