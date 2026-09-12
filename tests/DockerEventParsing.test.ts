jest.mock("../src/index", () => ({
  mqttClient: {
    publish: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
  },
}));

import DockerService from "../src/services/DockerService";

/**
 * Builds a Docker event as sent by the `/events` endpoint.
 * @param name The container name
 * @param action The event action
 * @param attributes Additional container attributes
 */
const dockerEvent = (name: string, action: string, attributes: Record<string, string> = {}) => ({
  status: action,
  id: 'a'.repeat(64),
  from: 'lscr.io/linuxserver/bazarr:latest',
  Type: 'container',
  Action: action,
  Actor: {
    ID: 'a'.repeat(64),
    Attributes: {
      name,
      image: 'lscr.io/linuxserver/bazarr:latest',
      'org.opencontainers.image.ref.name': 'ubuntu',
      ...attributes,
    },
  },
  scope: 'local',
  time: 1789000000,
  timeNano: 1789000000000000000,
});

describe('DockerService.parseDockerEventChunk', () => {
  test('parses a single newline terminated event', () => {
    const event = dockerEvent('bazarr', 'start');

    const { events, remainder } = DockerService.parseDockerEventChunk(`${JSON.stringify(event)}\n`);

    expect(remainder).toBe('');
    expect(events).toEqual([event]);
  });

  test('parses the several events that a single chunk can contain', () => {
    const first = dockerEvent('bazarr', 'health_status: healthy');
    const second = dockerEvent('radarr', 'die');

    const { events, remainder } = DockerService.parseDockerEventChunk(
      `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`
    );

    expect(remainder).toBe('');
    expect(events).toEqual([first, second]);
  });

  test('keeps a partial event as remainder and completes it with the next chunk', () => {
    const event = dockerEvent('bazarr', 'start');
    const serialized = JSON.stringify(event);
    const splitAt = 40;

    const firstChunk = DockerService.parseDockerEventChunk(serialized.substring(0, splitAt));
    expect(firstChunk.events).toEqual([]);
    expect(firstChunk.remainder).toBe(serialized.substring(0, splitAt));

    const secondChunk = DockerService.parseDockerEventChunk(
      `${serialized.substring(splitAt)}\n`,
      firstChunk.remainder
    );
    expect(secondChunk.remainder).toBe('');
    expect(secondChunk.events).toEqual([event]);
  });

  test('parses the complete events before a partial trailing event', () => {
    const complete = dockerEvent('bazarr', 'start');
    const partial = JSON.stringify(dockerEvent('radarr', 'die')).substring(0, 25);

    const { events, remainder } = DockerService.parseDockerEventChunk(
      `${JSON.stringify(complete)}\n${partial}`
    );

    expect(events).toEqual([complete]);
    expect(remainder).toBe(partial);
  });

  test('handles CRLF line endings and blank lines', () => {
    const event = dockerEvent('bazarr', 'start');

    const { events, remainder } = DockerService.parseDockerEventChunk(`\r\n${JSON.stringify(event)}\r\n\r\n`);

    expect(remainder).toBe('');
    expect(events).toEqual([event]);
  });

  test('returns no events for an empty chunk', () => {
    expect(DockerService.parseDockerEventChunk('')).toEqual({ events: [], remainder: '' });
  });
});
