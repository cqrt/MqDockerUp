import logger from "../services/LoggerService";
import { ImageRegistryAdapter } from "./ImageRegistryAdapter";

export class LscrAdapter extends ImageRegistryAdapter {
    private static readonly DOCKER_API_URL = 'https://hub.docker.com/v2/repositories';
    private tag: string;

    constructor(image: string, tag: string = 'latest', accessToken?: string) {
        super(image, accessToken);
        this.tag = tag;
    }

    static get displayName() {
        return 'LinuxServer.io';
    }

    static canHandleImage(image: string): boolean {
        try {
            const url = new URL(`https://${image}`);
            const host = url.hostname;
            // check if the host is exactly 'lcsr.io'
            const isLcsrIo = host === 'lscr.io';

            return isLcsrIo;
        } catch (error) {
            // if the image string is not a valid URL, it's not a LinuxServer.io image
            return false;
        }
    }

    private getImageUrl(): string {
        const image = this.image.replace('lscr.io/', '');

        return `${LscrAdapter.DOCKER_API_URL}/${image}/tags?name=${this.tag}`;
    }

    async checkForNewDigest(): Promise<{ newDigest: string; releaseNotes?: string; releaseUrl?: string; }> {
        try {
            let response = await this.http.get(this.getImageUrl());
            let newDigest = null;
            let releaseNotes: string | undefined;
            let releaseUrl: string | undefined;

            let images = response.data.results[0].images;
            if (images && images.length > 0) {
                newDigest = response.data.results[0].digest.split(":")[1];
            } else {
                logger.error("No Images found");
                logger.error(response);
            }

            // Try to fetch release notes from Docker Hub (lscr.io images are mirrored there)
            try {
                const repoInfo = await this.fetchRepositoryInfo();
                if (repoInfo) {
                    releaseNotes = repoInfo.description;
                    releaseUrl = repoInfo.url;
                }
            } catch (error) {
                logger.debug(`Could not fetch release notes for ${this.image}: ${error}`);
            }

            return { newDigest, releaseNotes, releaseUrl };
        } catch (error) {
            logger.error(`Failed to check for new lscr.io image digest: ${error}`);
            throw error;
        }
    }

    private getRepositoryUrl(): string {
        // lscr.io images are hosted on Docker Hub, remove the lscr.io prefix
        const image = this.image.replace('lscr.io/', '');
        return `${LscrAdapter.DOCKER_API_URL}/${image}`;
    }

    private async fetchRepositoryInfo(): Promise<{ description?: string; url?: string } | null> {
        try {
            const response = await this.http.get(this.getRepositoryUrl());
            const data = response.data;
            
            return {
                description: data.description || undefined,
                url: data.url || undefined,
            };
        } catch (error) {
            return null;
        }
    }
}
