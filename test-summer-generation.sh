#!/bin/bash

echo "========================================"
echo "夏季赛生成功能测试脚本"
echo "========================================"

# API基础URL
API_URL="http://localhost:3000/api"

# 1. 获取当前赛季
echo -e "\n1. 获取当前赛季..."
SEASON_ID=$(curl -s $API_URL/seasons/current | jq -r '.data.id')
echo "当前赛季ID: $SEASON_ID"

# 2. 检查赛季进度
echo -e "\n2. 检查赛季进度..."
curl -s $API_URL/seasons/$SEASON_ID/progress | jq '.data'

# 3. 生成夏季赛
echo -e "\n3. 生成夏季赛..."
RESULT=$(curl -s -X POST $API_URL/seasons/$SEASON_ID/proceed-to-summer)
echo $RESULT | jq '.'

# 检查是否成功
SUCCESS=$(echo $RESULT | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo -e "\n✅ 夏季赛生成成功！"
  
  # 4. 查询生成的夏季赛
  echo -e "\n4. 查询生成的夏季赛..."
  curl -s "$API_URL/competitions?seasonId=$SEASON_ID&type=summer" | jq '.data'
  
  # 5. 统计信息
  echo -e "\n5. 统计信息..."
  TOTAL_MATCHES=$(echo $RESULT | jq -r '.data.totalMatchesGenerated')
  SUCCESS_REGIONS=$(echo $RESULT | jq -r '.data.summary.successfulRegions')
  echo "总比赛场数: $TOTAL_MATCHES"
  echo "成功生成赛区数: $SUCCESS_REGIONS"
else
  echo -e "\n❌ 夏季赛生成失败！"
  echo $RESULT | jq '.error'
fi

echo -e "\n========================================"
echo "测试完成"
echo "========================================"
