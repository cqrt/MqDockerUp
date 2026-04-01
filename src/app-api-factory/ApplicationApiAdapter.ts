import axios, { AxiosInstance } from 'axios';
import logger from '../services/LoggerService';

export interface AppUpdateInfo {
    version?: string;
    releaseNotes?: string;
    releaseDate?: string;
    changes?: string[];
}

export abstract class ApplicationApiAdapter {
    protected http: AxiosInstance;
    protected containerName: string;
    protected apiKey?: string;
    protected baseUrl?: string;

    constructor(containerName: string, apiKey?: string, baseUrl?: string) {
        this.containerName = containerName;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        
        this.http = axios.create({
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Check if this adapter can handle the given container
     * @param containerName The name of the container
     * @param image The image name
     */
    static canHandle(containerName: string, image: string): boolean {
        return false;
    }

    /**
     * Get the display name for this application
     */
    static get displayName(): string {
        return 'Unknown Application';
    }

    /**
     * Fetch update information from the application's API
     */
    abstract fetchUpdateInfo(): Promise<AppUpdateInfo | null>;

    /**
     * Construct the API URL for the application
     */
    protected abstract getApiUrl(): string;

    /**
     * Format release notes from the application's response
     */
    protected abstract formatReleaseNotes(data: any): string;
}
