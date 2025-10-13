# 数据库迁移执行指南：S1/S2/S3 系统

## 📋 迁移概述

将现有的数字赛季ID（1, 2, 3）迁移为统一的S系统标识（S1, S2, S3），并统一所有相关表的ID格式。

## 🎯 迁移目标

### 迁移前
```
seasons:      id='1', '2', '3'
competitions: id='uuid-format'
matches:      id='uuid-format'
```

### 迁移后
```
seasons:      id='S1', 'S2', 'S3'
competitions: id='S1-LPL-spring-regular'
matches:      id='S1-LPL-spring-regular-R1-M1'
```

## 📁 迁移脚本文件

已创建以下脚本文件：

1. **migrate-to-s-system.sql** - 第一阶段：生成新ID并填充
2. **migrate-to-s-system-part2.sql** - 第二阶段：切换到新ID
3. **rollback-s-system-migration.sql** - 回滚脚本（如果出错）
4. **cleanup-backup-tables.sql** - 清理备份表（成功后）

## 🚀 执行步骤

### 前置准备

#### 1. 启动数据库
```bash
cd /Users/showiix/Documents/EsportManager/backend
docker-compose up postgres -d

# 等待数据库启动
docker-compose logs -f postgres | grep "ready to accept connections"
```

#### 2. 完整备份数据库（重要！）
```bash
# 使用pg_dump创建完整备份
docker-compose exec postgres pg_dump -U postgres esport_manager > backup_before_migration_$(date +%Y%m%d_%H%M%S).sql

# 或通过docker cp
docker-compose exec postgres pg_dump -U postgres esport_manager | gzip > backup_before_migration.sql.gz
```

#### 3. 连接到数据库
```bash
# 方法1: 使用docker-compose
docker-compose exec postgres psql -U postgres -d esport_manager

# 方法2: 如果本地安装了psql
psql -h localhost -p 5432 -U postgres -d esport_manager
```

### 阶段一：生成新ID

#### 1. 执行第一阶段迁移
```bash
# 在容器内执行
docker-compose exec postgres psql -U postgres -d esport_manager -f /path/to/migrate-to-s-system.sql

# 或在psql中执行
\i /Users/showiix/Documents/EsportManager/backend/scripts/migrate-to-s-system.sql
```

#### 2. 检查执行结果
脚本会自动输出验证信息，检查以下内容：

- ✅ 所有备份表已创建
- ✅ 所有表的新ID列已填充
- ✅ 没有缺失的新ID
- ✅ 没有重复的新ID

示例输出：
```
status                    | records
-------------------------+---------
seasons_backup           | 3
competitions_backup      | 32
matches_backup           | 720

Validation: seasons      | total: 3 | with_new_id: 3 | missing: 0
Validation: competitions | total: 32 | with_new_id: 32 | missing: 0
Validation: matches      | total: 720 | with_new_id: 720 | missing: 0
```

#### 3. 手动验证数据
```sql
-- 查看seasons表的新ID
SELECT id AS old_id, new_id, name, year FROM seasons;

-- 预期结果：
-- old_id | new_id | name      | year
-- 1      | S1     | S1赛季    | 2024
-- 2      | S2     | S2赛季    | 2025

-- 查看competitions表的新ID
SELECT id AS old_id, new_id, new_season_id, region_id, type, stage
FROM competitions LIMIT 5;

-- 预期结果：
-- old_id    | new_id                    | new_season_id | region_id | type   | stage
-- uuid...   | S1-LPL-spring-regular     | S1            | LPL       | spring | regular

-- 查看matches表的新ID
SELECT id AS old_id, new_id, new_competition_id, round_number, match_number
FROM matches LIMIT 5;

-- 预期结果：
-- old_id | new_id                         | new_competition_id        | round | match
-- uuid.. | S1-LPL-spring-regular-R1-M1    | S1-LPL-spring-regular     | 1     | 1
```

### 阶段二：切换到新ID

⚠️ **重要警告**: 此步骤会删除旧ID并切换到新ID，不可轻易逆转！

#### 1. 再次确认备份
```bash
# 确认备份文件存在
ls -lh backup_before_migration_*.sql*
```

#### 2. 执行第二阶段迁移
```bash
docker-compose exec postgres psql -U postgres -d esport_manager -f /path/to/migrate-to-s-system-part2.sql

# 或在psql中执行
\i /Users/showiix/Documents/EsportManager/backend/scripts/migrate-to-s-system-part2.sql
```

#### 3. 检查事务状态
脚本在事务中执行，需要手动COMMIT：

```sql
-- 脚本执行后会输出验证信息
-- 检查以下内容：
-- ✅ 外键约束已删除
-- ✅ 所有表已切换到新ID
-- ✅ 新的外键约束已创建
-- ✅ 索引已创建
-- ✅ 数据计数一致
-- ✅ 外键完整性验证通过

-- 如果一切正常，提交事务
COMMIT;

-- 如果发现问题，回滚事务
ROLLBACK;
```

#### 4. 最终验证
```sql
-- 查看seasons表（应该只有新ID）
SELECT * FROM seasons;

-- 查看competitions表
SELECT id, season_id, region_id, type, stage, name
FROM competitions
ORDER BY id
LIMIT 10;

-- 查看matches表
SELECT id, competition_id, season_id, round_number, match_number
FROM matches
ORDER BY id
LIMIT 10;

-- 验证外键约束
SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text;
```

## 🔧 如果出现问题

### 情况1：第一阶段发现问题
```sql
-- 删除临时映射表
DROP TABLE IF EXISTS season_id_mapping;
DROP TABLE IF EXISTS competition_id_mapping;

-- 删除新增的列
ALTER TABLE seasons DROP COLUMN IF EXISTS new_id;
ALTER TABLE seasons DROP COLUMN IF EXISTS display_name;
ALTER TABLE competitions DROP COLUMN IF EXISTS new_id;
-- ... 其他表类似
```

### 情况2：第二阶段需要回滚
```bash
# 在COMMIT之前发现问题
ROLLBACK;

# 如果已经COMMIT，使用回滚脚本
docker-compose exec postgres psql -U postgres -d esport_manager -f /path/to/rollback-s-system-migration.sql
```

### 情况3：彻底回滚（从备份恢复）
```bash
# 删除现有数据库
docker-compose exec postgres psql -U postgres -c "DROP DATABASE esport_manager;"

# 重新创建数据库
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE esport_manager;"

# 恢复备份
docker-compose exec postgres psql -U postgres -d esport_manager -f backup_before_migration_*.sql

# 或从压缩备份恢复
gunzip -c backup_before_migration.sql.gz | docker-compose exec -T postgres psql -U postgres -d esport_manager
```

## ✅ 迁移成功后

### 1. 测试应用功能
```bash
# 启动后端服务
cd /Users/showiix/Documents/EsportManager/backend
npm run dev

# 测试关键API
curl http://localhost:8000/api/seasons | jq '.'
curl http://localhost:8000/api/competitions | jq '.'
```

### 2. 清理备份表
```bash
# 确认应用运行正常后，清理备份表释放空间
docker-compose exec postgres psql -U postgres -d esport_manager -f /path/to/cleanup-backup-tables.sql
```

## 📊 迁移检查清单

- [ ] 已完整备份数据库（pg_dump）
- [ ] 已启动Docker数据库服务
- [ ] 已执行第一阶段脚本
- [ ] 已验证新ID生成正确
- [ ] 已验证无重复ID
- [ ] 已验证无缺失ID
- [ ] 已执行第二阶段脚本
- [ ] 已验证外键约束
- [ ] 已验证数据完整性
- [ ] 已提交事务（COMMIT）
- [ ] 已测试应用功能
- [ ] 已清理备份表（可选）

## 🎉 迁移后的优势

### 1. ID格式清晰
```
S1-LPL-spring-regular-R1-M1
↓  ↓   ↓      ↓       ↓  ↓
│  │   │      │       │  └─ 比赛编号
│  │   │      │       └──── 轮次编号
│  │   │      └──────────── 阶段（常规赛）
│  │   └─────────────────── 赛事类型（春季赛）
│  └─────────────────────── 赛区（LPL）
└────────────────────────── 赛季（S1）
```

### 2. 查询简化
```typescript
// 之前需要年份映射
const season = seasons.find(s => s.year === 2024)
await fetchCompetitions(season.id)

// 现在直接使用
await fetchCompetitions('S1')
```

### 3. 数据追踪容易
```sql
-- 查看S1赛季所有数据
SELECT * FROM competitions WHERE season_id = 'S1';
SELECT * FROM matches WHERE season_id = 'S1';

-- 查看特定赛事
SELECT * FROM competitions WHERE id = 'S1-LPL-spring-regular';
```

## 📞 技术支持

如有问题，请检查：
1. Docker服务是否正常运行
2. 数据库连接是否成功
3. 脚本执行日志中的错误信息
4. 备份文件是否完整

---

**迁移准备完成！请按照步骤执行，并随时检查验证结果。**
