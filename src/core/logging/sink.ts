import { LogEvent } from './events.js';

export interface LogSink {
  name: string;
  write(event: LogEvent): Promise<void> | void;
  writeBatch?(events: LogEvent[]): Promise<void> | void;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}
