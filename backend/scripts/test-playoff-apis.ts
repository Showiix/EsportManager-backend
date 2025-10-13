// =================================================================
// 季后赛API测试脚本
// =================================================================

import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';

// 创建axios实例
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 测试完成赛事接口
async function testFinishCompetition(competitionId: string) {
  console.log('\n=== 测试完成赛事接口 ===');
  console.log(`POST /api/competitions/${competitionId}/finish`);

  try {
    const response = await api.post(`/competitions/${competitionId}/finish`);
    console.log('✅ 成功:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
    throw error;
  }
}

// 测试检查季后赛资格接口
async function testCheckPlayoffEligibility(competitionId: string, regionId: string) {
  console.log('\n=== 测试检查季后赛资格接口 ===');
  console.log(`GET /api/playoffs/check-eligibility?competitionId=${competitionId}&regionId=${regionId}`);

  try {
    const response = await api.get('/playoffs/check-eligibility', {
      params: { competitionId, regionId }
    });
    console.log('✅ 成功:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
    throw error;
  }
}

// 测试生成季后赛接口
async function testGeneratePlayoff(
  competitionId: string,
  seasonId: string,
  regionId: string,
  type: 'spring' | 'summer'
) {
  console.log('\n=== 测试生成季后赛接口 ===');
  console.log('POST /api/playoffs/generate');
  console.log('请求体:', { competitionId, seasonId, regionId, type });

  try {
    const response = await api.post('/playoffs/generate', {
      competitionId,
      seasonId,
      regionId,
      competitionType: type
    });
    console.log('✅ 成功:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
    throw error;
  }
}

// 测试获取季后赛对阵接口
async function testGetPlayoffBracket(competitionId: string, regionId: string) {
  console.log('\n=== 测试获取季后赛对阵接口 ===');
  console.log(`GET /api/playoffs/bracket?competitionId=${competitionId}&regionId=${regionId}`);

  try {
    const response = await api.get('/playoffs/bracket', {
      params: { competitionId, regionId }
    });
    console.log('✅ 成功:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data || error.message);
    throw error;
  }
}

// 主测试流程
async function main() {
  console.log('========================================');
  console.log('季后赛API测试脚本');
  console.log('========================================');

  // 从命令行参数获取测试参数
  const competitionId = process.argv[2] || '1';
  const seasonId = process.argv[3] || '1';
  const regionId = process.argv[4] || 'LPL';
  const type = (process.argv[5] || 'summer') as 'spring' | 'summer';

  console.log('\n测试参数:');
  console.log(`- Competition ID: ${competitionId}`);
  console.log(`- Season ID: ${seasonId}`);
  console.log(`- Region ID: ${regionId}`);
  console.log(`- Type: ${type}`);

  try {
    // 步骤1: 完成赛事
    console.log('\n📝 步骤1: 完成赛事');
    await testFinishCompetition(competitionId);

    // 步骤2: 检查季后赛资格
    console.log('\n📝 步骤2: 检查季后赛资格');
    const eligibility = await testCheckPlayoffEligibility(competitionId, regionId);

    if (!eligibility.data.eligible) {
      console.log('\n⚠️  无法生成季后赛:', eligibility.data.reason);
      console.log('晋级队伍:', eligibility.data.qualifiedTeams);
      return;
    }

    // 步骤3: 生成季后赛
    console.log('\n📝 步骤3: 生成季后赛');
    await testGeneratePlayoff(competitionId, seasonId, regionId, type);

    // 步骤4: 获取季后赛对阵
    console.log('\n📝 步骤4: 获取季后赛对阵');
    const bracket = await testGetPlayoffBracket(competitionId, regionId);

    console.log('\n========================================');
    console.log('✅ 所有测试通过!');
    console.log('========================================');
    console.log('\n季后赛对阵摘要:');
    console.log(`- 对阵表ID: ${bracket.data.id}`);
    console.log(`- 赛区: ${bracket.data.regionName}`);
    console.log(`- 状态: ${bracket.data.status}`);
    console.log(`- 晋级队伍数量: ${bracket.data.qualifiedTeams.length}`);
    console.log(`- 比赛轮次: ${bracket.data.rounds.length}`);

    // 显示赛制信息
    console.log('\n比赛轮次详情:');
    bracket.data.rounds.forEach((round: any) => {
      console.log(`\n${round.roundName} (Round ${round.roundNumber}):` );
      round.matches.forEach((match: any) => {
        const teamA = match.teamAName || '待定';
        const teamB = match.teamBName || '待定';
        console.log(`  - ${teamA} vs ${teamB} (${match.status})`);
      });
    });

  } catch (error) {
    console.log('\n========================================');
    console.log('❌ 测试失败');
    console.log('========================================');
    process.exit(1);
  }
}

// 执行测试
main().catch(error => {
  console.error('测试执行错误:', error);
  process.exit(1);
});
