import { db } from '../src/config/database';

async function deleteSummerCompetition() {
  try {
    console.log('开始删除夏季赛competition...');

    // 1. 删除夏季赛相关的所有数据
    console.log('\n步骤1: 删除competition_teams关联');
    await db.query('DELETE FROM competition_teams WHERE competition_id = 7');
    console.log('✓ 已删除competition_teams');

    // 2. 删除competition记录
    console.log('\n步骤2: 删除competition记录');
    await db.query('DELETE FROM competitions WHERE id = 7');
    console.log('✓ 已删除competition记录');

    // 3. 清理积分榜
    console.log('\n步骤3: 清理夏季赛积分榜');
    try {
      await db.query(`DELETE FROM regional_standings WHERE season_id = 1 AND competition_type = 'summer'`);
      console.log('✓ 已清理积分榜');
    } catch (err) {
      console.log('✓ 没有积分榜需要清理');
    }

    console.log('\n✅ 夏季赛competition删除完成！');
    console.log('\n现在可以在前端MSI管理页面点击"生成夏季赛"按钮了');

  } catch (error) {
    console.error('删除失败:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

deleteSummerCompetition();
