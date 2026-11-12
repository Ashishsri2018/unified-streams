import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { AppEnv, deriveFleetEnv } from './core/env.js';
import { logger } from './core/logger.js';

interface FleetSpec {
  name: 'sa7' | 'nuvio' | 'vega';
  port: number;
}

const FLEETS: FleetSpec[] = [
  { name: 'sa7', port: 7001 },
  { name: 'nuvio', port: 7002 },
  { name: 'vega', port: 7003 },
];

export class Supervisor {
  private readonly env: AppEnv;
  private readonly children = new Map<string, ChildProcess>();
  private shuttingDown = false;

  constructor(env: AppEnv) {
    this.env = env;
    this.ensureDirs();
  }

  private ensureDirs(): void {
    const dirs = [
      this.env.DATA_DIR,
      path.join(this.env.DATA_DIR, 'sa7'),
      path.join(this.env.DATA_DIR, 'nuvio'),
      path.join(this.env.DATA_DIR, 'vega'),
      path.join(this.env.DATA_DIR, 'tmp'),
    ];
    for (const d of dirs) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }

    // Seed Vega baseline providers if not present
    const vegaTarget = path.join(this.env.DATA_DIR, 'vega', 'providers', 'Zenda-Cross');
    if (!fs.existsSync(vegaTarget)) {
      const distBaseline = path.resolve(process.cwd(), 'dist/fleets/vega/providers-baseline/Zenda-Cross');
      const srcBaseline = path.resolve(process.cwd(), 'src/fleets/vega/providers-baseline/Zenda-Cross');
      const baseline = fs.existsSync(distBaseline) ? distBaseline : srcBaseline;
      if (fs.existsSync(baseline)) {
        fs.mkdirSync(path.dirname(vegaTarget), { recursive: true });
        fs.cpSync(baseline, vegaTarget, { recursive: true });
      }
    }
  }

  start(): void {
    for (const fleet of FLEETS) {
      this.spawnWorker(fleet);
    }
  }

  private resolveWorkerEntry(name: 'sa7' | 'nuvio' | 'vega'): { cmd: string; args: string[] } {
    const distJs = path.resolve(process.cwd(), `dist/fleets/${name}/worker.js`);
    const srcJs = path.resolve(process.cwd(), `src/fleets/${name}/worker.js`);
    const srcTs = path.resolve(process.cwd(), `src/fleets/${name}/worker.ts`);

    if (fs.existsSync(distJs)) {
      return { cmd: process.execPath, args: [distJs] };
    }
    if (fs.existsSync(srcJs)) {
      return { cmd: process.execPath, args: [srcJs] };
    }
    if (fs.existsSync(srcTs)) {
      return { cmd: 'npx', args: ['tsx', srcTs] };
    }
    throw new Error(`Cannot find worker entry for fleet ${name}`);
  }

  private spawnWorker(spec: FleetSpec): void {
    if (this.shuttingDown) return;

    const fleetEnv = deriveFleetEnv(this.env, spec.name, spec.port);
    const { cmd, args } = this.resolveWorkerEntry(spec.name);

    const child = spawn(cmd, args, {
      env: { ...process.env, ...fleetEnv },
      stdio: 'inherit',
    });

    this.children.set(spec.name, child);
    logger.info('worker.started', { fleet: spec.name, pid: child.pid, port: spec.port });

    child.on('exit', (code, signal) => {
      this.children.delete(spec.name);
      if (this.shuttingDown) return;

      logger.warn('worker.exited', { fleet: spec.name, code, signal });
      // Restart after 2 seconds
      setTimeout(() => {
        this.spawnWorker(spec);
      }, 2000);
    });
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    for (const [name, child] of this.children.entries()) {
      logger.info('worker.stopping', { fleet: name });
      child.kill('SIGTERM');
    }
    // Allow grace period
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
