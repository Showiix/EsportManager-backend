#!/bin/bash
echo "开始模拟常规赛所有轮次..."
for i in {1..20}; do
  echo -n "第$i次调用: "
  curl -s -X POST "http://localhost:8000/api/competitions/1/simulate-round" | python3 -c "
import sys, json
try:
    d=json.load(sys.stdin).get('data',{})
    print(f'轮次{d.get(\"currentRound\",0)} -> {d.get(\"nextRound\",0)} (模拟{d.get(\"matchesSimulated\",0)}场)')
except:
    print('错误')
" 2>/dev/null
  sleep 0.5
done
echo "完成!"
