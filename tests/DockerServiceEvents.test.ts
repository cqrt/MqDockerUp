jest.mock("../src/index", () => ({
  mqttClient: {
    publish: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
  },
}));

import { EventEmitter } from "events";
import DockerService from "../src/services/DockerService";

/**
 * Minimal stand-in for the readable stream returned by `docker.getEvents()`.
 */
class FakeEventStream extends EventEmitter {
  public encoding: string | undefined;

  public setEncoding(encoding: string) {
    this.encoding = encoding;
    return this;
  }
}

/**
 * Builds a Docker event as sent by the `/events` endpoint.
 * @param name The container name
 * @param action The event action
 * @param type The type of the object the event is about
 */
const dockerEvent = (name: string, action: string, type: string = 'container') => ({
  Type: type,
  Action: action,
  Actor: {
    ID: 'a'.repeat(64),
    Attributes: { name },
  },
});

/**
 * Replaces the docker client with a fake that returns the events stream and
 * starts listening to Docker events.
 */
const startListening = (): FakeEventStream => {
  const stream = new FakeEventStream();

  (DockerService as any).docker = {
    getEvents: jest.fn((_options: any, callback: any) => callback(null, stream)),
  };

  DockerService.listenToDockerEvents();

  return stream;
};

/**
 * Feeds a single event into the events stream.
 */
const emitEvent = (stream: FakeEventStream, event: object) => {
  stream.emit('data', `${JSON.stringify(event)}\n`);
};

describe('DockerService.listenToDockerEvents', () => {
  afterEach(() => {
    DockerService.events.removeAllListeners();
  });

  test('emits container events to the listeners of the action', () => {
    const listener = jest.fn();
    DockerService.events.on('start', listener);

    const stream = startListening();
    emitEvent(stream, dockerEvent('bazarr', 'start'));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ containerName: 'bazarr', containerId: 'a'.repeat(64) });
  });

  test('emits health status changes without the status suffix', () => {
    const listener = jest.fn();
    DockerService.events.on('health_status', listener);

    const stream = startListening();
    emitEvent(stream, dockerEvent('bazarr', 'health_status: healthy'));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ containerName: 'bazarr', containerId: 'a'.repeat(64) });
  });

  test('does not emit actions that are not handled', () => {
    const listener = jest.fn();
    DockerService.events.on('exec_create', listener);

    const stream = startListening();
    emitEvent(stream, dockerEvent('bazarr', 'exec_create: /bin/sh'));

    expect(listener).not.toHaveBeenCalled();
  });

  test('does not emit events for other object types', () => {
    const listener = jest.fn();
    DockerService.events.on('start', listener);

    const stream = startListening();
    emitEvent(stream, dockerEvent('bazarr', 'start', 'network'));

    expect(listener).not.toHaveBeenCalled();
  });

  test('decodes the events stream as utf8', () => {
    const stream = startListening();

    expect(stream.encoding).toBe('utf8');
  });
});
