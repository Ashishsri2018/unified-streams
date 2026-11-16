import { inspect } from 'node:util';
import { LogEvent } from './events.js';
import { LogSink } from './sink.js';
import { redactObject } from '../redact.js';

export class StdoutSink implements LogSink {
  readonly name = 'stdout';

  constructor(private readonly pretty = false) {}

  write(event: LogEvent): void {
    const redacted = redactObject(event);
    const line = this.pretty
      ? inspect(redacted, { colors: false, depth: 5 })
      : JSON.stringify(redacted);
    process.stdout.write(line + '\n');
  }

  writeBatch(events: LogEvent[]): void {
    for (const event of events) {
      this.write(event);
    }
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
