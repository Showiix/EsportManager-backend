# SQL 脚本使用指南

本目录包含电竞赛事模拟系统的所有数据库相关SQL脚本。

## 📁 脚本文件说明

### 1. `init-db.sql` - 数据库初始化脚本
**用途**: 创建完整的数据库结构，包括表、索引、视图、触发器和基础数据

**包含内容**:
- 9个核心数据表的创建
- 完整的索引结构
- 2个业务视图
- 触发器和函数
- 基础的赛区和战队数据
- 示例赛季和赛事数据

**使用方法**:
```bash
# 方法1: 直接执行文件
psql -h localhost -p 5432 -U postgres -d esports_simulator -f scripts/init-db.sql

# 方法2: 通过Docker容器执行
docker-compose exec postgres psql -U postgres -d esports_simulator -f /tmp/init-db.sql
```

### 2. `seed-data.sql` - 种子数据脚本
**用途**: 在基础结构之上添加更多测试数据和示例比赛

**包含内容**:
- 为所有战队创建统计记录
- 添加示例比赛数据
- 模拟已完成的比赛结果
- 生成积分记录
- 创建完整的赛事体系

**使用方法**:
```bash
psql -h localhost -p 5432 -U postgres -d esports_simulator -f scripts/seed-data.sql
```

### 3. `queries.sql` - 常用查询脚本
**用途**: 提供开发和调试过程中常用的查询语句

**包含查询类型**:
- 基础查询: 战队信息、赛事信息
- 比赛相关: 最近比赛、即将比赛、战队历史
- 积分排名: 积分榜、赛区排名
- 统计分析: 赛区表现、比赛格式统计
- 数据质量检查
- 性能监控查询

**使用方法**:
```bash
# 可以选择性执行其中的查询语句
psql -h localhost -p 5432 -U postgres -d esports_simulator -f scripts/queries.sql
```

### 4. `maintenance.sql` - 数据库维护脚本
**用途**: 提供数据库维护、清理和修复功能

**包含功能**:
- 数据重置函数
- 数据修复函数
- 数据库优化
- 数据验证
- 定期维护任务
- 备份辅助功能

**使用方法**:
```bash
# 加载维护函数
psql -h localhost -p 5432 -U postgres -d esports_simulator -f scripts/maintenance.sql

# 然后可以调用具体函数
psql -h localhost -p 5432 -U postgres -d esports_simulator -c "SELECT daily_maintenance();"
```

## 🚀 快速开始指南

### 完整初始化数据库

1. **创建数据库** (如果不存在):
```bash
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE esports_simulator;"
```

2. **执行初始化脚本**:
```bash
docker-compose exec postgres psql -U postgres -d esports_simulator -f /docker-entrypoint-initdb.d/init-db.sql
```

3. **添加种子数据** (可选):
```bash
docker cp backend/scripts/seed-data.sql esportmanager-backend-postgres-1:/tmp/
docker-compose exec postgres psql -U postgres -d esports_simulator -f /tmp/seed-data.sql
```

4. **验证安装**:
```bash
docker-compose exec postgres psql -U postgres -d esports_simulator -c "\\dt"
docker-compose exec postgres psql -U postgres -d esports_simulator -c "SELECT COUNT(*) FROM teams;"
```

### 日常开发使用

#### 查看数据概览
```sql
-- 查看战队排名
SELECT * FROM v_team_rankings WHERE season_year = 2024 ORDER BY total_points DESC LIMIT 10;

-- 查看最近比赛
SELECT * FROM v_match_results WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 5;
```

#### 数据维护
```sql
-- 每日维护
SELECT daily_maintenance();

-- 修复统计数据
SELECT fix_team_statistics();

-- 验证数据完整性
SELECT * FROM validate_data_integrity();
```

## 📊 数据库结构概览

### 核心表结构
- **regions**: 赛区信息 (LPL, LCK, LEC, LCS)
- **teams**: 战队信息 (40支队伍)
- **seasons**: 赛季管理
- **competitions**: 赛事管理 (春季赛、夏季赛、MSI、世界赛)
- **matches**: 比赛记录
- **score_records**: 积分记录
- **team_statistics**: 战队统计数据
- **head_to_head_records**: 战队交锋记录

### 业务视图
- **v_team_rankings**: 战队排名视图
- **v_match_results**: 比赛结果视图

## 🔧 常用维护命令

### 数据重置
```sql
-- 重置所有数据
SELECT reset_all_data();

-- 重置特定赛季
SELECT reset_season_data(2024);
```

### 数据修复
```sql
-- 修复战队统计
SELECT fix_team_statistics();

-- 修复交锋记录
SELECT fix_head_to_head_records();
```

### 性能优化
```sql
-- 更新统计信息
SELECT update_database_statistics();

-- 重建索引
SELECT rebuild_indexes();

-- 清理数据库
SELECT vacuum_database();
```

## 📈 性能监控

### 查看表大小
```sql
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;
```

### 查看索引使用情况
```sql
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

## 🔍 故障排除

### 常见问题

1. **连接问题**:
```bash
# 检查数据库服务状态
docker-compose ps postgres

# 查看日志
docker-compose logs postgres
```

2. **权限问题**:
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
```

3. **数据不一致**:
```sql
-- 运行数据验证
SELECT * FROM validate_data_integrity();

-- 修复发现的问题
SELECT fix_team_statistics();
```

## 📝 开发建议

1. **定期备份**: 在重要操作前备份数据
2. **测试环境**: 在测试环境中验证脚本
3. **版本控制**: 所有SQL变更都应该通过版本控制
4. **监控性能**: 定期检查查询性能和数据库大小
5. **文档更新**: 保持脚本文档的及时更新

## 📞 支持

如果在使用过程中遇到问题:
1. 检查日志: `docker-compose logs postgres`
2. 验证数据: `SELECT * FROM validate_data_integrity();`
3. 查看文档: 详细的操作指南请参考 `数据库操作方案.md`