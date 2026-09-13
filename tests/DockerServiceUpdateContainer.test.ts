jest.mock("../src/index", () => ({
  mqttClient: {
    publish: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
  },
}));

jest.mock("../src/services/HomeassistantService", () => ({
  __esModule: true,
  default: {
    publishUpdateProgressMessage: jest.fn().mockResolvedValue(undefined),
    publishImageUpdateMessage: jest.fn().mockResolvedValue(undefined),
    publishMessage: jest.fn(),
  },
}));

jest.mock("../src/services/DatabaseService", () => ({
  __esModule: true,
  default: {
    getTopics: jest.fn((_containerId: string, callback: Function) => callback(null, [])),
    deleteContainer: jest.fn().mockResolvedValue(undefined),
    addContainer: jest.fn().mockResolvedValue(undefined),
  },
}));

import DockerService from "../src/services/DockerService";
import DatabaseService from "../src/services/DatabaseService";

describe('DockerService.restartContainer', () => {
  test('resolves after restarting without waiting for the container to stop', async () => {
    const restart = jest.fn().mockResolvedValue(undefined);
    // A restarted container keeps running, so `wait()` never resolves
    const wait = jest.fn(() => new Promise<void>(() => { /* never resolves */ }));

    (DockerService as any).docker = {
      getContainer: jest.fn(() => ({ restart, wait })),
    };

    await expect(DockerService.restartContainer('container-id')).resolves.toBeUndefined();

    expect(restart).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});

describe('DockerService.updateContainer', () => {
  const containerId = 'container-id';

  const oldContainerInfo = {
    Id: containerId,
    Image: 'sha256:old-image',
    Name: '/bazarr',
    Config: { Image: 'linuxserver/bazarr:latest', Labels: {} },
    HostConfig: {},
    NetworkSettings: {},
    Mounts: [],
  };

  const newContainerInfo = {
    Id: 'new-container-id',
    Name: '/bazarr',
    Config: { Image: 'linuxserver/bazarr:latest' },
  };

  const buildDocker = (onFinishedDelay: number = 10) => {
    const container = {
      inspect: jest.fn().mockResolvedValue(oldContainerInfo),
      stop: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const newContainer = {
      start: jest.fn().mockResolvedValue(undefined),
      inspect: jest.fn().mockResolvedValue(newContainerInfo),
    };

    const docker = {
      getContainer: jest.fn(() => container),
      pull: jest.fn((_image: string, callback: Function) => callback(null, 'stream')),
      modem: {
        followProgress: jest.fn((_stream: any, onFinished: Function) => {
          setTimeout(() => onFinished(null, []), onFinishedDelay);
        }),
      },
      createContainer: jest.fn().mockResolvedValue(newContainer),
      getImage: jest.fn(() => ({ remove: jest.fn((_options: any, callback: Function) => callback(null, {})) })),
    };

    return { docker, container, newContainer };
  };

  afterEach(() => {
    DockerService.updatingContainers = [];
  });

  test('resolves with the new container once the update has finished', async () => {
    const { docker, container, newContainer } = buildDocker();
    (DockerService as any).docker = docker;

    const result = await DockerService.updateContainer(containerId);

    expect(result).toBe(newContainer);
    expect(container.inspect).toHaveBeenCalledTimes(1);
    expect(container.stop).toHaveBeenCalledTimes(1);
    expect(container.remove).toHaveBeenCalledTimes(1);
    expect(docker.createContainer).toHaveBeenCalledTimes(1);
    expect(newContainer.start).toHaveBeenCalledTimes(1);
    expect(DatabaseService.addContainer)
      .toHaveBeenCalledWith('new-container-id', 'bazarr', 'linuxserver/bazarr', 'latest');
  });

  test('tracks the container while updating and stops tracking it afterwards', async () => {
    const { docker } = buildDocker();
    let trackedDuringUpdate: string[] = [];
    docker.createContainer = jest.fn(() => {
      trackedDuringUpdate = [...DockerService.updatingContainers];
      return Promise.reject(new Error('could not create container'));
    });
    (DockerService as any).docker = docker;

    const result = await DockerService.updateContainer(containerId);

    expect(result).toBeUndefined();
    expect(trackedDuringUpdate).toContain(containerId);
    expect(DockerService.updatingContainers).not.toContain(containerId);
  });

  test('resolves to undefined when the pull fails', async () => {
    const { docker } = buildDocker();
    docker.pull = jest.fn((_image: string, callback: Function) => callback(new Error('pull failed')));
    (DockerService as any).docker = docker;

    await expect(DockerService.updateContainer(containerId)).resolves.toBeUndefined();
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  test('resolves to undefined when the container no longer exists', async () => {
    const inspectError = Object.assign(new Error('no such container'), { statusCode: 404 });
    (DockerService as any).docker = {
      getContainer: jest.fn(() => ({ inspect: jest.fn().mockRejectedValue(inspectError) })),
    };

    await expect(DockerService.updateContainer(containerId)).resolves.toBeUndefined();
  });
});
