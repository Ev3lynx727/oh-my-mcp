import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  try {
    const req = JSON.parse(line);
    let result;
    if (req.method === 'initialize') {
      result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'echo-test', version: '1.0.0' } };
    } else if (req.method === 'tools/list') {
      result = { tools: [{ name: 'echo', description: 'Echoes back params' }] };
    } else if (req.method === 'resources/list') {
      result = { resources: [] };
    } else {
      result = { echo: req.params ?? {}, method: req.method };
    }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
  }
});

process.on('uncaughtException', () => { process.exit(1); });
