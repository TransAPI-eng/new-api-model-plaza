"""生成 official.json：各厂商官方 API 价格（USD / 1M tokens）+ 当日 USD→CNY 汇率。

数据源：
  - 官方价：https://models.dev/api.json（只取各厂商自家的 provider，不取转售平台）
  - 汇率：  https://open.er-api.com/v6/latest/USD

开源仓库里用 GitHub Action 每天跑一次，组件只读这个小文件，运行时不访问任何第三方。
用法：python tools/build_official.py [models.dev 本地缓存路径] > data/official.json
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone

# 厂商自家渠道，越靠前优先级越高（同名模型以先出现的为准）
FIRST_PARTY = [
    'anthropic', 'openai', 'google', 'xai', 'deepseek', 'alibaba', 'zhipuai',
    'moonshotai', 'minimax', 'mistral', 'meta',
]


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'model-plaza-build'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding='utf-8') as f:
            md = json.load(f)
    else:
        md = get('https://models.dev/api.json')
    fx = get('https://open.er-api.com/v6/latest/USD')

    models = {}
    for pid in FIRST_PARTY:
        for mid, m in (md.get(pid, {}).get('models') or {}).items():
            cost = m.get('cost') or {}
            if 'input' not in cost or 'output' not in cost:
                continue
            k = mid.lower()
            if k in models:
                continue
            # [输入, 输出, 缓存读, 缓存写, 厂商]
            models[k] = [cost['input'], cost['output'], cost.get('cache_read'), cost.get('cache_write'), pid]

    json.dump(
        {
            'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
            'fx': {'CNY': round(fx['rates']['CNY'], 4), 'time': fx['time_last_update_utc']},
            'source': 'models.dev + open.er-api.com',
            'models': models,
        },
        sys.stdout,
        ensure_ascii=False,
        separators=(',', ':'),
    )


if __name__ == '__main__':
    main()
