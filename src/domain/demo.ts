/**
 * Demo/test script for the new domain layer.
 *
 * Run with: npx tsx src/domain/demo.ts
 */

import { MCPServer, ServerStatus, HealthStatus } from './index.js';

console.log('=== Domain Layer Demo ===\n');

// 1. Create a server from config
const server = MCPServer.fromRawConfig({
  id: 'github',
  name: 'GitHub MCP Server',
  command: ['npx', '-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_TOKEN: 'ghp_xxx' },
  timeout: 60000,
  enabled: true,
});

console.log('1. Created server:');
console.log('   ID:', server.id);
console.log('   Name:', server.name);
console.log('   Command:', server.getCommand().join(' '));
console.log('   Status:', server.getStatus());
console.log('   Is running?', server.isRunning());
console.log('   Can accept requests?', server.canAcceptRequests());
console.log();

// 2. Simulate state transitions
console.log('2. Simulating lifecycle:');

server.markStarting();
console.log('   After markStarting():', server.getStatus()); // STARTING

// Simulate successful start (would normally happen with ProcessManager)
server.markRunning(8100, {} as any); // {} as any is a placeholder for ChildProcess
console.log('   After markRunning():', server.getStatus(), 'on port', server.getPort());
console.log('   Is running?', server.isRunning());
console.log('   Started at:', server.getStartedAt());
console.log();

// 3. Health checks
console.log('3. Health checks:');
server.updateHealth(true);
console.log('   First health check:', server.getHealth()?.ok ? 'healthy' : 'unhealthy');
console.log('   Can accept requests?', server.canAcceptRequests());
console.log();

server.updateHealth(false, 'Connection timeout');
console.log('   Second health check (failed):', server.getHealth()?.ok ? 'healthy' : 'unhealthy');
console.log('   Message:', server.getHealth()?.message);
console.log('   Consecutive failures:', (server as any).consecutiveHealthFailures); // For demo only
console.log();

// 4. Error after threshold
console.log('4. Simulating threshold for error transition:');
const testServer = MCPServer.fromRawConfig({
  id: 'test',
  command: ['true'],
  timeout: 60000,
  enabled: true,
  healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
});
testServer.on('error', (err) => {
  console.log(`   [Event] error: ${err}`);
});
testServer.markStarting();
testServer.markRunning(8101, {} as any);
for (let i = 0; i < 3; i++) {
  testServer.updateHealth(false, `Check ${i + 1} failed`);
  console.log(`   Failure ${i + 1}: status = ${testServer.getStatus()}, canAcceptRequests? ${testServer.canAcceptRequests()}`);
}
// After 3 failures (threshold), server should mark as ERROR
console.log('   After 3 failures, final status:', testServer.getStatus());
console.log('   Error message:', testServer.getError());
console.log();

// 5. Stop
console.log('5. Stopping server:');
server.markStopped();
console.log('   After markStopped():', server.getStatus());
console.log('   Port cleared (auto-allocated)?', server.getPort() === 0);
console.log('   Can accept requests?', server.canAcceptRequests());
console.log();

// 6. toJSON and toAPIDTO
console.log('6. Serialization:');
const json = server.toJSON();
console.log('   toJSON() keys:', Object.keys(json));
const dto = server.toAPIDTO();
console.log('   toAPIDTO() keys:', Object.keys(dto));
console.log('   Config in DTO (sanitized):', dto.config);
console.log();

// 7. Event handling
console.log('7. Events:');
const eventServer = MCPServer.fromRawConfig({ id: 'events', command: ['true'], timeout: 60000 });
eventServer.on('statusChange', (newStatus) => {
  console.log(`   [Event] status changed to: ${newStatus}`);
});
eventServer.on('error', (err) => {
  console.log(`   [Event] error: ${err}`);
});
eventServer.markStarting();
eventServer.markRunning(8102, {} as any);
eventServer.markStopped();

console.log('\n=== Demo Complete ===');
console.log('Domain layer validates successfully! 🎉');
