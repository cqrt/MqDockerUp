jest.mock("../src/index", () => ({
  mqttClient: {
    publish: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
  },
}));

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

import axios from "axios";
import DockerService from "../src/services/DockerService";

const mockedGet = axios.get as unknown as jest.Mock;

describe('DockerService.getSourceRepo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DockerService.SourceUrlCache.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns the source repository from the image labels', async () => {
    jest.spyOn(DockerService, "getImageInfo").mockResolvedValue({
      Config: { Labels: { 'org.opencontainers.image.source': 'https://github.com/linuxserver/docker-bazarr' } },
    } as any);

    await expect(DockerService.getSourceRepo('lscr.io/linuxserver/bazarr', 'latest'))
      .resolves.toBe('https://github.com/linuxserver/docker-bazarr');

    expect(mockedGet).not.toHaveBeenCalled();
  });

  test('parses the repository URL from the Docker Hub description', async () => {
    jest.spyOn(DockerService, "getImageInfo").mockRejectedValue(new Error('no such image'));
    mockedGet.mockResolvedValue({
      status: 200,
      data: { full_description: 'Some description\n\n[github](https://github.com/linuxserver/docker-bazarr)\n' },
    });

    await expect(DockerService.getSourceRepo('linuxserver/bazarr', 'latest'))
      .resolves.toBe('https://github.com/linuxserver/docker-bazarr');
  });

  test('uses the cached URL on subsequent calls', async () => {
    jest.spyOn(DockerService, "getImageInfo").mockRejectedValue(new Error('no such image'));
    mockedGet.mockResolvedValue({
      status: 200,
      data: { full_description: '[github] https://github.com/linuxserver/docker-bazarr' },
    });

    await DockerService.getSourceRepo('linuxserver/bazarr', 'latest');

    await expect(DockerService.getSourceRepo('linuxserver/bazarr', 'latest'))
      .resolves.toBe('https://github.com/linuxserver/docker-bazarr');

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  test('resolves to null when the Docker Hub request fails without a response', async () => {
    jest.spyOn(DockerService, "getImageInfo").mockRejectedValue(new Error('no such image'));
    mockedGet.mockRejectedValue(new Error('getaddrinfo ENOTFOUND hub.docker.com'));

    await expect(DockerService.getSourceRepo('linuxserver/bazarr', 'latest')).resolves.toBeNull();
  });

  test('resolves to null when the repository does not exist on Docker Hub', async () => {
    jest.spyOn(DockerService, "getImageInfo").mockRejectedValue(new Error('no such image'));
    mockedGet.mockRejectedValue({ response: { status: 404 } });

    await expect(DockerService.getSourceRepo('linuxserver/bazarr', 'latest')).resolves.toBeNull();
  });

  test('resolves to null when the description has no GitHub repository', async () => {
    jest.spyOn(DockerService, "getImageInfo").mockRejectedValue(new Error('no such image'));
    mockedGet.mockResolvedValue({ status: 200, data: { full_description: 'No repository here' } });

    await expect(DockerService.getSourceRepo('linuxserver/bazarr', 'latest')).resolves.toBeNull();
  });
});

describe('DockerService.parseGithubUrl', () => {
  const parseGithubUrl = (fullDescription: string): string | null =>
    (DockerService as any)['parseGithubUrl'](fullDescription);

  test('parses a markdown link', () => {
    expect(parseGithubUrl('readme [github](https://github.com/owner/repo) more'))
      .toBe('https://github.com/owner/repo');
  });

  test('parses a plain URL following the marker', () => {
    expect(parseGithubUrl('[github] https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
  });

  test('returns null when there is no marker', () => {
    expect(parseGithubUrl('https://github.com/owner/repo')).toBeNull();
  });

  test('returns null when the marker is not followed by a URL', () => {
    expect(parseGithubUrl('[github] see the documentation')).toBeNull();
  });
});
