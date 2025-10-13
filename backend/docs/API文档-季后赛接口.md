# 季后赛API接口文档

## 概述

本文档描述了常规赛结束后生成季后赛的完整API流程。所有接口都已实现并可用于生产环境。

## 季后赛赛制说明

### 正确的季后赛赛制（双败淘汰 BO5）

- **晋级规则**：常规赛前4名进入季后赛
- **分组**：第1-2名进胜者组，第3-4名进败者组
- **赛制流程**：
  1. **胜者组第一轮**：1 vs 2 → 胜者进总决赛，败者进败者组决赛
  2. **败者组第一轮**：3 vs 4 → 胜者进败者组决赛，败者为第4名
  3. **败者组决赛**：胜者组第一轮败者 vs 败者组第一轮胜者 → 胜者进总决赛，败者为第3名
  4. **总决赛**：胜者组第一轮胜者 vs 败者组决赛胜者 → 决出冠军（12分）、亚军（10分）

- **积分奖励**：
  - 冠军：12分
  - 亚军：10分
  - 季军：8分
  - 第4名：6分
  - 常规赛第5-6名各3分（计入年度积分）

## 接口列表

### 1. 完成赛事接口

**接口路径**：`POST /api/competitions/:id/finish`

**功能描述**：标记常规赛为完成状态，是生成季后赛的前置条件。

**请求参数**：
- Path参数：
  - `id` (string, 必填): 赛事ID

**返回格式**：
```json
{
  "success": true,
  "data": {
    "id": "1",
    "seasonId": "1",
    "type": "summer",
    "name": "2024夏季赛",
    "status": "completed",
    "startDate": "2024-06-01T00:00:00.000Z",
    "endDate": "2024-08-31T23:59:59.999Z",
    "updatedAt": "2024-08-31T23:59:59.999Z"
  },
  "meta": {
    "timestamp": "2024-08-31T23:59:59.999Z",
    "requestId": "uuid"
  }
}
```

**错误响应**：
- `COMPETITION_NOT_ACTIVE`: 赛事状态不是active，无法完成
- `REGULAR_SEASON_NOT_COMPLETE`: 还有比赛未完成

**前置条件**：
- 赛事状态必须是 `active`
- 该赛事的所有比赛必须已完成（status = 'completed'）

---

### 2. 检查季后赛资格接口

**接口路径**：`GET /api/playoffs/check-eligibility`

**功能描述**：检查是否可以生成季后赛，返回资格检查结果和晋级队伍列表。

**请求参数**：
- Query参数：
  - `competitionId` (string, 必填): 赛事ID
  - `regionId` (string, 必填): 赛区ID（如 "LPL", "LCK", "LEC", "LCS"）

**返回格式（符合条件）**：
```json
{
  "success": true,
  "data": {
    "eligible": true,
    "qualifiedTeams": [
      {
        "teamId": "1",
        "teamName": "JDG",
        "regionId": "LPL",
        "seed": 1,
        "regularSeasonRank": 1,
        "regularSeasonPoints": 54,
        "wins": 18,
        "losses": 0
      },
      {
        "teamId": "2",
        "teamName": "BLG",
        "regionId": "LPL",
        "seed": 2,
        "regularSeasonRank": 2,
        "regularSeasonPoints": 48,
        "wins": 16,
        "losses": 2
      },
      {
        "teamId": "3",
        "teamName": "WBG",
        "regionId": "LPL",
        "seed": 3,
        "regularSeasonRank": 3,
        "regularSeasonPoints": 42,
        "wins": 14,
        "losses": 4
      },
      {
        "teamId": "4",
        "teamName": "LNG",
        "regionId": "LPL",
        "seed": 4,
        "regularSeasonRank": 4,
        "regularSeasonPoints": 39,
        "wins": 13,
        "losses": 5
      }
    ]
  },
  "meta": {
    "timestamp": "2024-08-31T23:59:59.999Z",
    "requestId": "uuid"
  }
}
```

**返回格式（不符合条件）**：
```json
{
  "success": true,
  "data": {
    "eligible": false,
    "reason": "常规赛尚未结束"
  },
  "meta": {
    "timestamp": "2024-08-31T23:59:59.999Z",
    "requestId": "uuid"
  }
}
```

**可能的不符合条件原因**：
- "赛事不存在"
- "常规赛尚未结束"
- "该赛区季后赛已生成"
- "晋级队伍不足4支(当前X支)"

---

### 3. 生成季后赛接口

**接口路径**：`POST /api/playoffs/generate`

**功能描述**：为指定赛区生成季后赛对阵，创建双败淘汰赛制的比赛。

**请求参数**：
```json
{
  "competitionId": "1",
  "seasonId": "1",
  "regionId": "LPL",
  "competitionType": "summer"
}
```

字段说明：
- `competitionId` (string, 必填): 常规赛赛事ID
- `seasonId` (string, 必填): 赛季ID
- `regionId` (string, 必填): 赛区ID
- `competitionType` (string, 必填): 赛事类型，"spring" 或 "summer"

**返回格式**：
```json
{
  "success": true,
  "data": {
    "id": "playoff-uuid",
    "competitionId": "1",
    "regionId": "LPL",
    "regionName": "英雄联盟职业联赛",
    "competitionType": "summer",
    "status": "not_started",
    "qualifiedTeams": [
      {
        "teamId": "1",
        "teamName": "JDG",
        "regionId": "LPL",
        "seed": 1,
        "regularSeasonRank": 1,
        "regularSeasonPoints": 54,
        "wins": 18,
        "losses": 0
      },
      // ... 其他3支队伍
    ],
    "rounds": [
      {
        "roundNumber": 1,
        "roundName": "胜者组第一轮",
        "bracketType": "winners",
        "status": "pending",
        "matches": [
          {
            "id": "match-uuid-1",
            "competitionId": "1",
            "playoffBracketId": "playoff-uuid",
            "roundNumber": 1,
            "matchType": "winners_bracket",
            "bestOf": 5,
            "teamAId": "1",
            "teamBId": "2",
            "teamAName": "JDG",
            "teamBName": "BLG",
            "teamASeed": 1,
            "teamBSeed": 2,
            "scoreA": 0,
            "scoreB": 0,
            "status": "pending"
          }
        ]
      },
      {
        "roundNumber": 1,
        "roundName": "败者组第一轮",
        "bracketType": "losers",
        "status": "pending",
        "matches": [
          {
            "id": "match-uuid-2",
            "competitionId": "1",
            "playoffBracketId": "playoff-uuid",
            "roundNumber": 1,
            "matchType": "losers_bracket",
            "bestOf": 5,
            "teamAId": "3",
            "teamBId": "4",
            "teamAName": "WBG",
            "teamBName": "LNG",
            "teamASeed": 3,
            "teamBSeed": 4,
            "scoreA": 0,
            "scoreB": 0,
            "status": "pending"
          }
        ]
      },
      {
        "roundNumber": 2,
        "roundName": "败者组决赛",
        "bracketType": "losers",
        "status": "pending",
        "matches": [
          {
            "id": "match-uuid-3",
            "competitionId": "1",
            "playoffBracketId": "playoff-uuid",
            "roundNumber": 2,
            "matchType": "losers_bracket",
            "bestOf": 5,
            "teamAId": null,
            "teamBId": null,
            "teamAName": null,
            "teamBName": null,
            "scoreA": 0,
            "scoreB": 0,
            "status": "pending"
          }
        ]
      },
      {
        "roundNumber": 3,
        "roundName": "总决赛",
        "bracketType": "grand_final",
        "status": "pending",
        "matches": [
          {
            "id": "match-uuid-4",
            "competitionId": "1",
            "playoffBracketId": "playoff-uuid",
            "roundNumber": 3,
            "matchType": "grand_final",
            "bestOf": 5,
            "teamAId": null,
            "teamBId": null,
            "teamAName": null,
            "teamBName": null,
            "scoreA": 0,
            "scoreB": 0,
            "status": "pending"
          }
        ]
      }
    ],
    "pointsDistribution": {
      "champion": 12,
      "runnerUp": 10,
      "thirdPlace": 8,
      "fourthPlace": 6
    },
    "createdAt": "2024-08-31T23:59:59.999Z",
    "updatedAt": "2024-08-31T23:59:59.999Z"
  },
  "meta": {
    "timestamp": "2024-08-31T23:59:59.999Z",
    "requestId": "uuid"
  }
}
```

**错误响应**：
- `REGULAR_SEASON_NOT_COMPLETE`: 常规赛未结束或不符合生成条件
- `PLAYOFF_ALREADY_EXISTS`: 该赛区季后赛已存在

---

### 4. 获取季后赛对阵接口

**接口路径**：`GET /api/playoffs/bracket`

**功能描述**：获取已生成的季后赛对阵信息。

**请求参数**：
- Query参数：
  - `competitionId` (string, 必填): 赛事ID
  - `regionId` (string, 必填): 赛区ID

**返回格式**：同"生成季后赛接口"返回格式，但会包含最新的比赛状态和结果。

---

### 5. 模拟季后赛比赛接口

**接口路径**：`POST /api/playoffs/simulate-match`

**功能描述**：模拟执行一场季后赛比赛（BO5）。

**请求参数**：
```json
{
  "matchId": "match-uuid",
  "competitionId": "1"
}
```

**返回格式**：
```json
{
  "success": true,
  "data": {
    "match": {
      "id": "match-uuid",
      "scoreA": 3,
      "scoreB": 1,
      "winnerId": "1",
      "status": "completed",
      "completedAt": "2024-09-01T12:00:00.000Z"
    },
    "bracket": {
      // 更新后的完整季后赛对阵信息
    },
    "isPlayoffComplete": false,
    "finalStandings": null
  },
  "meta": {
    "timestamp": "2024-09-01T12:00:00.000Z",
    "requestId": "uuid"
  }
}
```

当季后赛全部结束时，`isPlayoffComplete` 为 `true`，`finalStandings` 包含最终排名：
```json
{
  "isPlayoffComplete": true,
  "finalStandings": {
    "champion": { /* PlayoffQualification */ },
    "runnerUp": { /* PlayoffQualification */ },
    "thirdPlace": { /* PlayoffQualification */ },
    "fourthPlace": { /* PlayoffQualification */ }
  }
}
```

---

## 完整使用流程

### 前端调用示例

```typescript
// 1. 完成常规赛
const finishResponse = await competitionApi.finishCompetition(competitionId);

// 2. 检查季后赛资格
const eligibilityResponse = await playoffApi.checkPlayoffEligibility({
  competitionId,
  regionId
});

if (!eligibilityResponse.data.eligible) {
  console.error('无法生成季后赛:', eligibilityResponse.data.reason);
  return;
}

// 3. 生成季后赛
const playoffResponse = await playoffApi.generatePlayoff({
  competitionId,
  seasonId,
  regionId,
  competitionType: 'summer'
});

console.log('季后赛对阵已生成:', playoffResponse.data);

// 4. 获取季后赛对阵（可选，用于刷新显示）
const bracketResponse = await playoffApi.getPlayoffBracket({
  competitionId,
  regionId
});
```

### 测试脚本使用

已提供测试脚本：`backend/scripts/test-playoff-apis.ts`

运行方式：
```bash
# 安装依赖
cd backend
npm install

# 编译TypeScript
npm run build

# 运行测试脚本
npx ts-node scripts/test-playoff-apis.ts [competitionId] [seasonId] [regionId] [type]

# 示例
npx ts-node scripts/test-playoff-apis.ts 1 1 LPL summer
```

---

## 数据库表结构

### playoff_brackets 表
存储季后赛对阵表的基本信息。

### playoff_matches 表
存储季后赛的每场比赛，包括：
- 双方队伍信息
- 比赛类型（winners_bracket/losers_bracket/grand_final）
- 比赛去向（nextMatchId, loserNextMatchId）
- 比赛结果（scoreA, scoreB, winnerId）

---

## 注意事项

1. **赛制顺序**：必须先完成常规赛（调用finish接口）才能生成季后赛
2. **幂等性**：同一赛区的季后赛只能生成一次，重复调用会返回错误
3. **比赛模拟**：季后赛比赛需要按顺序模拟，待定队伍的比赛无法模拟
4. **积分分配**：季后赛完成后会自动分配年度积分
5. **并发生成**：建议为不同赛区的季后赛按顺序生成，避免数据库并发问题

---

## 常见问题

### Q1: 如何判断常规赛是否结束？
A: 调用 `GET /api/playoffs/check-eligibility` 接口，检查 `eligible` 字段。

### Q2: 季后赛生成后可以重新生成吗？
A: 不可以，需要先删除已有的季后赛记录（目前不支持，需要手动操作数据库）。

### Q3: 如何获取季后赛进度？
A: 调用 `GET /api/playoffs/bracket` 接口，查看 `rounds` 中每场比赛的 `status`。

### Q4: 季后赛比赛如何确定顺序？
A:
- Round 1: 两场比赛可以并行模拟
- Round 2: 必须等待 Round 1 两场比赛都完成
- Round 3: 必须等待 Round 2 完成

---

## 更新日志

### 2024-10-13
- ✅ 完成三个核心接口实现
- ✅ 修正季后赛赛制为正确的双败淘汰制
- ✅ 添加API测试脚本
- ✅ 编写完整的对接文档



> 对，因为春季赛以及实现了，现在我在开发夏季赛，
只需要调整推进的机制 

⏺ 好的！我已经完成了所有工作。让我总结一下：

  ✅ 完成情况

  1. 所有接口已实现并可用

  后端的三个核心接口都已经完整实现：

  - ✅ POST /api/competitions/:id/finish -
  完成常规赛
    - CompetitionController.ts:342-360
    - CompetitionService.ts:589-644
  - ✅ GET /api/playoffs/check-eligibility -
  检查季后赛资格
    - PlayoffController.ts:222-255
    - PlayoffService.ts:108-171
  - ✅ POST /api/playoffs/generate -
  生成季后赛对阵
    - PlayoffController.ts:18-49
    - PlayoffService.ts:271-364

  2. 季后赛赛制是正确的

  现有代码实现的是正确的双败淘汰制（不是报告17中
  错误描述的半决赛制）：
  - Round 1: 1 vs 2（胜者组）+ 3 vs 4（败者组）
  - Round 2: 败者组决赛
  - Round 3: 总决赛

  3. 春季赛和夏季赛通用

  代码已经支持 competitionType: 'spring' | 
  'summer'，所以相同的接口可以用于夏季赛，只需要
  在调用时传入正确的参数：

  // 夏季赛示例
  await playoffApi.generatePlayoff({
    competitionId: summerCompetitionId,
    seasonId: seasonId,
    regionId: 'LPL',
    competitionType: 'summer'  // 
  这里指定为summer
  });

  4. 已创建的文件

  - 📄 backend/scripts/test-playoff-apis.ts -
  API测试脚本
  - 📄 backend/docs/API文档-季后赛接口.md -
  完整的接口文档

  ---
  关于推进机制

  您提到需要调整夏季赛的推进机制。目前代码中：

  1. 春季赛流程：春季赛常规赛 → 春季赛季后赛 →
  MSI
  2. 夏季赛流程：夏季赛常规赛 → 夏季赛季后赛 →
  世界赛

  请问您具体需要调整什么推进机制？比如：
  - 夏季赛季后赛结束后如何推进到世界赛？
  - 如何计算年度积分并确定世界赛名额？
  - 是否需要添加新的推进接口（类似春季赛的
  proceedToSummer）？

  我可以帮您实现相应的推进逻辑！
