import { db } from '../src/config/database';

async function resetSummerSeason() {
  try {
    console.log('开始重置夏季赛...');

    // 1. 将夏季赛状态改回 planning 以便重新开始
    const updateStatusQuery = `
      UPDATE competitions
      SET status = 'planning', updated_at = NOW()
      WHERE id = 7 AND type = 'summer' AND season_id = 1
    `;
    await db.query(updateStatusQuery);
    console.log('✓ 夏季赛状态已重置为 planning');

    // 2. 清除旧的积分榜数据（如果regional_standings表有competition_type字段）
    try {
      const clearStandingsQuery = `
        DELETE FROM regional_standings
        WHERE season_id = 1 AND competition_type = 'summer'
      `;
      const standingsResult = await db.query(clearStandingsQuery);
      console.log(`✓ 清除了 ${standingsResult.rowCount} 条夏季赛积分榜记录`);
    } catch (err: any) {
      console.log('✓ 没有积分榜数据需要清除（或字段不存在）');
    }

    console.log('\n✅ 夏季赛重置完成！');
    console.log('\n下一步：');
    console.log('1. 在前端进入"赛程管理" → "赛区赛程"');
    console.log('2. 选择 S1 夏季赛');
    console.log('3. 点击"生成赛程"按钮重新生成赛程');
    console.log('4. 然后模拟18轮常规赛');
    console.log('5. 最后点击"完成赛季"测试季后赛生成');

  } catch (error) {
    console.error('重置失败:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

resetSummerSeason();
