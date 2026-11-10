#!/usr/bin/env node
/**
 * 自动同步裸域 A 记录到当前最快的 CloudFront 边缘 IP。
 *
 * 用法：
 *   node scripts/sync-edge-dns.mjs                 # 只测速，不改 DNS
 *   node scripts/sync-edge-dns.mjs --apply         # 测速并写入 Cloudflare
 *   node scripts/sync-edge-dns.mjs --apply --count=10 --max-ms=200
 *
 * 环境变量：
 *   CF_API_TOKEN    Cloudflare Token（Zone.DNS Edit；按域名查 zone 还需 Zone.Zone Read）
 *   CF_ZONE_ID      可选，Cloudflare Zone ID；不填则用 token 按域名查询
 *   EXTRA_EDGE_IPS  可选，逗号分隔的额外候选 IP（比如你在 ITDog 看到很快的新加坡/越南 IP）
 *   EDGE_REGIONS    可选，默认 hk,sg,vn,jp,kr,tw,cn,mo
 */

import https from 'node:https';
import { execFileSync } from 'node:child_process';

const ZONE_NAME = process.env.CF_ZONE_NAME || '173682.xyz';
const APEX = process.env.EDGE_APEX || ZONE_NAME;
const HOST = process.env.SITE_HOST || APEX;
const CF_DOMAIN = process.env.CF_DOMAIN || 'd1pkmtzc2o3iqr.cloudfront.net';
const TOKEN = process.env.CF_API_TOKEN || '';
const ZONE_ID = process.env.CF_ZONE_ID || '';
const COUNT = Number(process.env.EDGE_COUNT || 10);
const MAX_MS = Number(process.env.EDGE_MAX_MS || 60);
const APPLY = process.argv.includes('--apply');
const REGION_MODE = process.argv.includes('--region-mode') || process.env.EDGE_REGION_MODE === '1';
const REGIONS = (process.env.EDGE_REGIONS || 'hk,sg,vn,jp,kr,tw,cn,mo')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const IP_SOURCE = process.env.EDGE_IP_SOURCE || '';
const EXTRA_IPS = (process.env.EXTRA_EDGE_IPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const KNOWN_IPS = {
  hk: ['3.175.214.14', '3.175.214.45', '3.175.214.81', '3.175.214.87'],
  sg: [
    '13.35.35.7',
    '13.35.35.90',
    '13.35.202.85',
    '13.35.202.13',
    '13.35.227.191',
    '13.35.37.29',
    '65.9.168.121',
  ],
  jp: ['13.32.50.1'],
};

const SUBNETS = {
  hk: ['1.36.0.0/16', '203.198.0.0/16', '210.6.0.0/16', '218.102.0.0/16'],
  sg: ['165.21.0.0/16', '118.189.0.0/16', '203.116.0.0/16', '175.156.0.0/16', '118.200.0.0/16'],
  vn: ['115.72.0.0/16', '113.160.0.0/16', '210.245.0.0/16'],
  jp: ['133.11.0.0/16'],
  kr: ['121.130.0.0/16'],
  tw: ['61.220.0.0/16'],
  th: ['171.100.0.0/16'],
  cn: ['113.108.0.0/16', '123.125.0.0/16', '120.196.0.0/16'],
  mo: ['202.175.0.0/16'],
};

function request(url, { method = 'GET', headers = {}, body = null, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, timeout }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getJson(url) {
  try {
    const response = await request(url);
    if (response.json) return response.json;
  } catch {
    /* fall through to curl */
  }
  return JSON.parse(execFileSync('curl', ['-s', '--max-time', '15', url], { encoding: 'utf8' }));
}

function probe(ip) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const req = https.request(
      {
        host: ip,
        port: 443,
        servername: HOST,
        method: 'GET',
        path: '/',
        headers: { Host: HOST, 'User-Agent': 'edge-sync' },
        timeout: 8000,
      },
      (res) => {
        const ttfb = Number(process.hrtime.bigint() - started) / 1e6;
        res.resume();
        res.on('end', () =>
          resolve({ ip, ttfb: Math.round(ttfb), status: res.statusCode, pop: res.headers['x-amz-cf-pop'] || '-' }),
        );
      },
    );
    req.on('error', () => resolve({ ip, ttfb: 99999, status: 0, pop: '-' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ip, ttfb: 99999, status: 0, pop: '-' });
    });
    req.end();
  });
}

async function discover() {
  const found = new Map();

  for (const region of REGIONS) {
    for (const ip of KNOWN_IPS[region] || []) {
      if (!found.has(ip)) found.set(ip, new Set());
      found.get(ip).add(region);
    }

    for (const subnet of SUBNETS[region] || []) {
      const url = `https://dns.google/resolve?name=${CF_DOMAIN}&type=A&edns_client_subnet=${subnet}`;
      try {
        const data = await getJson(url);
        const ips = (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
        for (const ip of ips) {
          if (!found.has(ip)) found.set(ip, new Set());
          found.get(ip).add(region);
        }
        console.log(`  ${region} ${subnet} -> ${ips.join(' ') || '-'}`);
      } catch {
        console.log(`  ${region} ${subnet} -> dns fail`);
      }
    }
  }

  if (REGIONS.includes('hk') && found.size > 0) {
    try {
      const data = await getJson(`https://dns.google/resolve?name=${CF_DOMAIN}&type=A`);
      for (const answer of data.Answer || []) {
        if (answer.type !== 1) continue;
        if (!found.has(answer.data)) found.set(answer.data, new Set());
        found.get(answer.data).add('default');
      }
    } catch {
      /* ignore */
    }
  }

  for (const ip of EXTRA_IPS) {
    if (!found.has(ip)) found.set(ip, new Set());
    found.get(ip).add('extra');
  }

  // 可选：从社区“CloudFront 优选 IP”页面/文本拉取候选
  if (IP_SOURCE) {
    try {
      const text = execFileSync('curl', ['-s', '--max-time', '20', IP_SOURCE], {
        encoding: 'utf8',
      });
      const matches = [...new Set(text.match(/(?:\d{1,3}\.){3}\d{1,3}/g) || [])].slice(0, 24);
      for (const ip of matches) {
        if (!found.has(ip)) found.set(ip, new Set());
        found.get(ip).add('extra');
      }
      console.log(`  优选源 ${IP_SOURCE} -> ${matches.length} 个候选`);
    } catch {
      console.log(`  优选源 ${IP_SOURCE} -> 拉取失败`);
    }
  }

  return found;
}

async function cloudflare(path, method = 'GET', body = null) {
  if (!TOKEN) throw new Error('缺少 CF_API_TOKEN');
  const response = await request(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!response.json) throw new Error(`Cloudflare 返回异常: ${response.text?.slice(0, 200)}`);
  if (!response.json.success) {
    throw new Error(`Cloudflare API 失败: ${JSON.stringify(response.json.errors)}`);
  }
  return response.json.result;
}

async function resolveZoneId() {
  if (ZONE_ID) return ZONE_ID;
  const zones = await cloudflare(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
  if (!zones?.length) throw new Error(`找不到 zone ${ZONE_NAME}`);
  return zones[0].id;
}

async function main() {
  console.log(`\n发现候选 IP（目标 ${CF_DOMAIN}，区域 ${REGIONS.join(',')}）`);
  const found = await discover();
  const candidates = [...found.keys()];

  if (!candidates.length) {
    console.error('没有发现任何候选 IP');
    process.exit(1);
  }

  console.log(`\n测速 ${candidates.length} 个 IP（TLS + TTFB，取 3 次中位数）`);
  const measured = [];
  for (const ip of candidates) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await probe(ip));
    runs.sort((a, b) => a.ttfb - b.ttfb);
    const median = runs[1];
    const ok = median.status >= 200 && median.status < 400 && median.ttfb <= MAX_MS;
    measured.push({ ...median, regions: [...found.get(ip)].join(','), ok });
    console.log(
      `  ${String(median.ttfb).padStart(5)}ms  ${ip.padEnd(16)} ${median.pop.padEnd(9)} ${median.status}  ${found.get(ip).size ? [...found.get(ip)].join(',') : ''}${ok ? '' : '  (跳过)'}`,
    );
  }

  let selected;

  if (REGION_MODE) {
    // GitHub 等海外机器测不出中国真实延迟：按区域优先级选，只做健康检查
    const priority = ['hk', 'sg', 'jp', 'kr', 'tw', 'mo', 'cn', 'vn', 'extra'];
    const rank = (item) => {
      let best = 99;
      for (const region of item.regions.split(',')) {
        const index = priority.indexOf(region);
        if (index >= 0) best = Math.min(best, index);
      }
      return best;
    };

    // 校验 CloudFront 返回的 x-amz-cf-pop，防止海外 runner 把美国 IP 当成香港
    const POP_PREFIX = {
      hk: ['HKG'],
      sg: ['SIN'],
      jp: ['NRT', 'KIX'],
      kr: ['ICN'],
      tw: ['TPE'],
      mo: ['HKG'],
      cn: ['HKG'],
      vn: ['HAN', 'SGN', 'SIN'],
      extra: [],
    };

    const regionOk = (item) => {
      for (const region of item.regions.split(',')) {
        const prefixes = POP_PREFIX[region];
        if (!prefixes || !prefixes.length) continue;
        if (prefixes.some((prefix) => item.pop.startsWith(prefix))) return true;
      }
      return false;
    };

    selected = measured
      .filter((item) => item.status >= 200 && item.status < 400 && regionOk(item))
      .sort((a, b) => rank(a) - rank(b) || a.ttfb - b.ttfb)
      .slice(0, COUNT);

    // 兜底：使用内置种子，避免 pop 校验把全部候选过滤掉
    if (!selected.length) {
      const known = new Set(REGIONS.flatMap((region) => KNOWN_IPS[region] || []));
      selected = measured
        .filter((item) => known.has(item.ip) && item.status >= 200 && item.status < 400)
        .slice(0, COUNT);
    }
  } else {
    selected = measured
      .filter((item) => item.ok)
      .sort((a, b) => a.ttfb - b.ttfb)
      .slice(0, COUNT);
  }

  if (!selected.length) {
    console.error(`没有 IP 满足 ${MAX_MS}ms 阈值`);
    process.exit(1);
  }

  console.log(`\n选中 ${selected.length} 个：`);
  for (const item of selected) console.log(`  ${item.ip}  ${item.ttfb}ms  ${item.pop}`);

  if (!APPLY) {
    console.log('\n当前是 dry-run。确认无误后加 --apply 写入 Cloudflare。');
    return;
  }

  const zoneId = await resolveZoneId();
  console.log(`\nCloudflare zone: ${zoneId}`);

  const records = await cloudflare(
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(APEX)}&per_page=100`,
  );
  const removable = (records || []).filter(
    (record) => record.name === APEX && ['A', 'AAAA', 'CNAME'].includes(record.type),
  );

  for (const record of removable) {
    await cloudflare(`/zones/${zoneId}/dns_records/${record.id}`, 'DELETE');
    console.log(`  删除 ${record.type} ${record.name} ${record.content}`);
  }

  for (const item of selected) {
    await cloudflare(`/zones/${zoneId}/dns_records`, 'POST', {
      type: 'A',
      name: APEX,
      content: item.ip,
      ttl: 60,
      proxied: false,
      comment: `edge-sync ${new Date().toISOString().slice(0, 10)}`,
    });
    console.log(`  添加 A ${APEX} -> ${item.ip}`);
  }

  console.log('\n完成。稍等 1 分钟后验证：nslookup ' + APEX);
}

main().catch((error) => {
  console.error('失败:', error.message);
  process.exit(1);
});
