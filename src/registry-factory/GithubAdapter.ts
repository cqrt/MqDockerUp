import ConfigService from "../services/ConfigService";
import logger from "../services/LoggerService";
import { ImageRegistryAdapter } from "./ImageRegistryAdapter";

const config = ConfigService.getConfig();

export class GithubAdapter extends ImageRegistryAdapter {
    private tag: string;

    constructor(image: string, tag: string = 'latest') {
        const accessToken =  config?.accessTokens?.github;

        super(image, accessToken);
        this.tag = tag;

        if (!accessToken) {
            logger.error('Github access token is not defined');
        }

    }

    static get displayName() {
        return 'Github Packages';
    }

    static canHandleImage(image: string): boolean {
        try {
            const url = new URL(`https://${image}`);
            const host = url.hostname;
    
            // check if the host is exactly 'ghcr.io'
            return host === 'ghcr.io';
        } catch (error) {
            // if the image string is not a valid URL, it's not a Github image
            return false;
        }
    }

    private getImageUrl(): string {
        const imageNameWithTag = this.image.split(':')[0];
        const [registry, user, image] = imageNameWithTag.split('/');
        return `https://${registry}/v2/${user}/${image}/manifests/${this.tag}`;
    }

    async checkForNewDigest(): Promise<{ newDigest: string; releaseNotes?: string; releaseUrl?: string; }> {
        const accessTokenSet = !!config?.accessTokens?.github;
        if (accessTokenSet) {
            try {
                this.http.defaults.headers['Accept'] = 'application/vnd.oci.image.index.v1+json';

                const response = await this.http.get(this.getImageUrl());
                const newDigest = this.removeSHA256Prefix(response.headers['docker-content-digest']);

                // Try to fetch release notes from GitHub API
                let releaseNotes: string | undefined;
                let releaseUrl: string | undefined;

                try {
                    const releaseInfo = await this.fetchReleaseInfo();
                    if (releaseInfo) {
                        releaseNotes = releaseInfo.body;
                        releaseUrl = releaseInfo.html_url;
                    }
                } catch (error) {
                    logger.debug(`Could not fetch release notes for ${this.image}: ${error}`);
                }

                return { newDigest, releaseNotes, releaseUrl };
            } catch (error) {
                logger.error(`Failed to check for new Github image digest: ${error}`);
                throw error;
            }
        }

        return { newDigest: "" };
    }

    private getRepoInfo(): { owner: string; repo: string } | null {
        // Parse image like ghcr.io/owner/repo or ghcr.io/owner/repo:tag
        const parts = this.image.split('/');
        if (parts.length >= 3) {
            const owner = parts[1];
            const repo = parts[2].split(':')[0]; // Remove tag if present
            return { owner, repo };
        }
        return null;
    }

    private async fetchReleaseInfo(): Promise<{ body?: string; html_url?: string } | null> {
        const repoInfo = this.getRepoInfo();
        if (!repoInfo) {
            return null;
        }

        const { owner, repo } = repoInfo;
        const tag = this.tag;

        // Create a separate HTTP client for GitHub API
        const githubApi = this.http;

        try {
            // First, try to get release by tag
            const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
            githubApi.defaults.headers['Accept'] = 'application/vnd.github.v3+json';
            
            const response = await githubApi.get(releaseUrl);
            const data = response.data;

            return {
                body: data.body || undefined,
                html_url: data.html_url || undefined,
            };
        } catch (error: any) {
            // If release by tag not found, try to get the latest release
            if (error.response?.status === 404) {
                try {
                    const latestReleaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
                    const response = await githubApi.get(latestReleaseUrl);
                    const data = response.data;

                    return {
                        body: data.body || undefined,
                        html_url: data.html_url || undefined,
                    };
                } catch (latestError) {
                    logger.debug(`No releases found for ${owner}/${repo}`);
                    return null;
                }
            }
            return null;
        }
    }
}
