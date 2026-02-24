import ConfigService from "../services/ConfigService";
import logger from "../services/LoggerService";
import { ImageRegistryAdapter } from "./ImageRegistryAdapter";

const config = ConfigService.getConfig();

export class GithubAdapter extends ImageRegistryAdapter {
    private tag: string;
    private accessToken: string | undefined;

    constructor(image: string, tag: string = 'latest') {
        const accessToken =  config?.accessTokens?.github;

        super(image, accessToken);
        this.tag = tag;
        this.accessToken = accessToken;

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

    async checkForNewDigest(): Promise<{ newDigest: string; releaseNotes?: string; repoUrl?: string; }> {
        const accessTokenSet = !!config?.accessTokens?.github;
        if (accessTokenSet) {
            try {
                this.http.defaults.headers['Accept'] = 'application/vnd.oci.image.index.v1+json';

                const response = await this.http.get(this.getImageUrl());
                const newDigest = this.removeSHA256Prefix(response.headers['docker-content-digest']);

                // Fetch release notes from GitHub API
                let releaseNotes: string | undefined = undefined;
                let repoUrl: string | undefined = undefined;
                try {
                    const imageNameWithTag = this.image.split(':')[0];
                    const [registry, user, image] = imageNameWithTag.split('/');
                    const releaseApiUrl = `https://api.github.com/repos/${user}/${image}/releases/latest`;
                    repoUrl = `https://github.com/${user}/${image}`;
                    
                    // Create headers for GitHub API - use plain token, not base64 encoded
                    const githubHeaders: any = {
                        'Accept': 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    };
                    
                    // Add authorization if token is available
                    if (this.accessToken) {
                        githubHeaders['Authorization'] = `Bearer ${this.accessToken}`;
                    }
                    
                    const releaseResponse = await this.http.get(releaseApiUrl, {
                        headers: githubHeaders
                    });
                    
                    if (releaseResponse.data && releaseResponse.data.body) {
                        releaseNotes = releaseResponse.data.body;
                        logger.info(`Fetched release notes for ${user}/${image}`);
                    }
                } catch (releaseError: any) {
                    logger.warn(`Could not fetch release notes for image: ${releaseError.message || releaseError}`);
                    // Don't throw - release notes are optional
                }

                return { newDigest, releaseNotes, repoUrl };
            } catch (error) {
                logger.error(`Failed to check for new Github image digest: ${error}`);
                throw error;
            }
        }

        return { newDigest: "" };
    }
}
