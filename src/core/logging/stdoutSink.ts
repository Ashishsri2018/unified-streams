import { LogEvent } from './events.js';
import { LogSink } from './sink.js';
import { redactObject } from '../redact.js';

export class StdoutSink implements LogSink {
  readonly name = 'stdout';

  write(event: LogEvent): void {
    const redacted = redactObject(event);
    process.stdout.write(JSON.stringify(redacted) + '\n');
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
