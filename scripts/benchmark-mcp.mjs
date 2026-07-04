#!/usr/bin/env node
import * as http from 'http';
import { performance } from 'perf_hooks';
import { once } from 'events';

const SERVERS = [
  { id: 'ark-exec',   port: 8101 },
  { id: 'ark-memory', port: 8102 },
  { id: 'ark-resolve',port: 8103 },
  { id: 'mempalace',  port: 8104 },
];
const RUNS = 5;

// Open an SSE connection and return { sid, res, destroy }
function sseConnect(port) {
  const result = { sid: null, _res: null, _req: null };
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/sse`, { timeout: 5000 }, (res) => {
      result._res = res; result._req = req;
      res.once('data', (chunk) => {
        const m = chunk.toString().match(/sessionId=([^\s]+)/);
        result.sid = m ? m[1] : null;
        resolve(result);
      });
    });
    req.on('error', () => { resolve(result); });
  });
}

// POST JSON-RPC, measure time until response arrives on SSE stream
function mcpCall(port, sse, method, params = {}) {
  return new Promise((resolve) => {
    const start = performance.now();
    const id = Date.now() % 1e9;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    let done = false;
    const timeout = setTimeout(() => { done = true; resolve({ dur: -1, ok: false, err: 'timeout' }); }, 10000);

    const onData = (chunk) => {
      const text = chunk.toString();
      // SSE data lines: "data: {..." or multi-line
      const lines = text.split('\n').filter(l => l.startsWith('data:'));
      for (const line of lines) {
        try {
          const msg = JSON.parse(line.slice(5));
          if (msg.id === id) {
            done = true; clearTimeout(timeout);
            sse._res.off('data', onData);
            resolve({ dur: performance.now() - start, ok: !msg.error, err: msg.error?.message || null });
            return;
          }
        } catch {}
      }
    };
    sse._res.on('data', onData);

    const req = http.request({
      hostname: 'localhost', port,
      path: `/message?sessionId=${sse.sid}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (r) => { r.on('data', () => {}); r.on('end', () => {}); });
    req.on('error', (e) => { if (!done) { done = true; clearTimeout(timeout); sse._res.off('data', onData); resolve({ dur: -1, ok: false, err: e.message }); }});
    req.write(body);
    req.end();
  });
}

function stats(ns) {
  if (!ns.length) return { avg: 'NaN', min: 'NaN', max: 'NaN' };
  return {
    avg: (ns.reduce((a,b)=>a+b,0)/ns.length).toFixed(1),
    min: Math.min(...ns).toFixed(1),
    max: Math.max(...ns).toFixed(1),
  };
}

async function main() {
  console.log('\n=== Opening SSE sessions ===');
  const sess = {};
  for (const s of SERVERS) {
    sess[s.id] = await sseConnect(s.port);
    console.log(`  ${s.id.padEnd(12)} ${sess[s.id].sid ? 'OK' : 'FAIL'}`);
  }

  console.log('\n=== Cold start (initialize) ===');
  for (const s of SERVERS) {
    const r = await mcpCall(s.port, sess[s.id], 'initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'bm', version: '1.0' }
    });
    console.log(`  ${s.id.padEnd(12)} ${r.ok ? (String(Math.round(r.dur)).padStart(4)+'ms') : 'FAIL '+(r.err||'')}`);
  }

  console.log(`\n=== Warm — tools/list (${RUNS} runs) ===`);
  for (const s of SERVERS) {
    const ds = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await mcpCall(s.port, sess[s.id], 'tools/list');
      if (r.ok) ds.push(r.dur);
    }
    const st = stats(ds);
    console.log(`  ${s.id.padEnd(12)} avg ${st.avg}ms  min ${st.min}ms  max ${st.max}ms`);
  }

  console.log(`\n=== ark-exec: method comparison (${RUNS} runs each) ===`);
  for (const method of ['ping', 'tools/list']) {
    const ds = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await mcpCall(8101, sess['ark-exec'], method);
      if (r.ok) ds.push(r.dur);
    }
    const st = stats(ds);
    console.log(`  ${method.padEnd(16)} avg ${st.avg}ms  min ${st.min}ms  max ${st.max}ms`);
  }

  // Cumulative
  const portToId = Object.fromEntries(SERVERS.map(s => [s.port, s.id]));
  console.log('\n=== Serial cumulative startup ===');
  // Reconnect fresh (no warm init) and measure 4 serial initialize calls
  const coldSess = {};
  for (const s of SERVERS) {
    coldSess[s.id] = await sseConnect(s.port);
  }
  const t0 = performance.now();
  for (const s of SERVERS) {
    await mcpCall(s.port, coldSess[s.id], 'initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'bm', version: '1.0' }
    });
  }
  console.log(`  total ${(performance.now() - t0).toFixed(0)}ms`);

  // Cleanup
  for (const id of Object.keys(sess)) {
    if (sess[id]?._req) sess[id]._req.destroy();
    if (coldSess[id]?._req) coldSess[id]._req.destroy();
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
