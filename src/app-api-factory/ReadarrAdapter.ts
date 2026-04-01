import { ApplicationApiAdapter, AppUpdateInfo } from './ApplicationApiAdapter';
import logger from '../services/LoggerService';

interface ReadarrUpdate {
    version: string;
    branch: string;
    releaseDate: string;
    fileName: string;
    url: string;
    installed: boolean;
    installable: boolean;
    latest: boolean;
    changes: {
        fixed?: string[];
        new?: string[];
    };
}

export class ReadarrAdapter extends ApplicationApiAdapter {
    static get displayName(): string {
        return 'Readarr';
    }

    static canHandle(containerName: string, image: string): boolean {
        const lowerName = containerName.toLowerCase();
        const lowerImage = image.toLowerCase();
        
        return lowerName.includes('readarr') || lowerImage.includes('readarr');
    }

    protected getApiUrl(): string {
        if (this.baseUrl) {
            return `${this.baseUrl}/api/v1/update`;
        }
        
        // Default to localhost with common Readarr port
        return `http://${this.containerName}:8787/api/v1/update`;
    }

    protected formatReleaseNotes(updates: ReadarrUpdate[]): string {
        if (!updates || updates.length === 0) {
            return '';
        }

        const latestUpdate = updates.find(u => u.latest) || updates[0];
        
        let notes = `## ${latestUpdate.version}\n`;
        notes += `**Release Date:** ${new Date(latestUpdate.releaseDate).toLocaleDateString()}\n\n`;

        if (latestUpdate.changes) {
            if (latestUpdate.changes.new && latestUpdate.changes.new.length > 0) {
                notes += `### New Features\n`;
                latestUpdate.changes.new.forEach(change => {
                    notes += `- ${change}\n`;
                });
                notes += '\n';
            }

            if (latestUpdate.changes.fixed && latestUpdate.changes.fixed.length > 0) {
                notes += `### Bug Fixes\n`;
                latestUpdate.changes.fixed.forEach(change => {
                    notes += `- ${change}\n`;
                });
            }
        }

        return notes.trim();
    }

    async fetchUpdateInfo(): Promise<AppUpdateInfo | null> {
        try {
            const url = this.getApiUrl();
            const headers: any = {};
            
            if (this.apiKey) {
                headers['X-Api-Key'] = this.apiKey;
            }

            logger.debug(`Fetching Readarr updates from: ${url}`);
            
            const response = await this.http.get<ReadarrUpdate[]>(url, { headers });
            
            if (!response.data || response.data.length === 0) {
                logger.warn(`No update information available for Readarr container: ${this.containerName}`);
                return null;
            }

            const latestUpdate = response.data.find(u => u.latest) || response.data[0];
            const releaseNotes = this.formatReleaseNotes(response.data);

            logger.info(`Successfully fetched Readarr update info for ${this.containerName}`);

            return {
                version: latestUpdate.version,
                releaseNotes: releaseNotes,
                releaseDate: latestUpdate.releaseDate,
                changes: [
                    ...(latestUpdate.changes?.new || []),
                    ...(latestUpdate.changes?.fixed || [])
                ]
            };
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                logger.debug(`Could not connect to Readarr API for ${this.containerName}: ${error.message}`);
            } else if (error.response?.status === 401) {
                logger.warn(`Readarr API authentication failed for ${this.containerName}. API key may be required.`);
            } else {
                logger.debug(`Failed to fetch Readarr update info for ${this.containerName}: ${error.message}`);
            }
            return null;
        }
    }
}
