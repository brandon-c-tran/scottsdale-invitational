// Isolated, local-only rehearsal. Never uses the project's .wrangler state.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, '.product-audit-2026-09-07');
mkdirSync(dir, { recursive: true });
const config = {
  name: 'field-day-product-audit',
  main: resolve(root, 'worker/index.js'),
  compatibility_date: '2026-07-21',
  compatibility_flags: ['nodejs_compat'],
  assets: { directory: resolve(root, 'dist/client'), binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/ws', '/api/*'] },
  durable_objects: { bindings: [{ name: 'TOURNAMENT', class_name: 'Tournament' }] },
  migrations: [{ tag: 'v1', new_sqlite_classes: ['Tournament'] }],
  vars: { APP_ENV: 'local', APP_VERSION: 'product-audit-2026-09-07', GM_PIN: '2468', QA_ENABLED: 'true', PROGRESS_RESET_ENABLED: 'true', M2_SHOW_CONTROL_ENABLED: 'true', M2_AUDIO_CATALOG_ENABLED: 'true', M2_AUDIO_PLAYBACK_ENABLED: 'true' }
};
writeFileSync(resolve(dir, 'wrangler.json'), JSON.stringify(config, null, 2));
const child = spawn(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', resolve(dir, 'wrangler.json'), '--local', '--port', '5187', '--inspector-port', '9247', '--persist-to', resolve(dir, 'state'), '--log-level', 'warn', '--show-interactive-dev-session=false'], { cwd: dir, stdio: 'inherit', windowsHide: true, env: { ...process.env, XDG_CONFIG_HOME: resolve(dir, 'config'), WRANGLER_LOG_PATH: resolve(dir, 'logs'), WRANGLER_REGISTRY_PATH: resolve(dir, 'registry'), WRANGLER_SEND_METRICS: 'false' } });
// Separate origins give each browser role an independent device/claim/session,
// while every HTTP/WebSocket connection reaches the same local authority.
const proxies = [5188, 5189, 5190, 5191, 5192].map(port => {
  const server = net.createServer(socket => {
    const upstream = net.connect(5187, '127.0.0.1');
    socket.pipe(upstream).pipe(socket);
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
  });
  server.listen(port, '127.0.0.1');
  return server;
});
console.log('Audit only: 5187 commissioner; 5188/5189 co-commissioners; 5190 player; 5191 TV; 5192 fresh guest. Test PIN 2468.');
child.on('exit', code => { proxies.forEach(server => server.close()); process.exit(code ?? 0); });
process.on('SIGINT', () => child.kill());
