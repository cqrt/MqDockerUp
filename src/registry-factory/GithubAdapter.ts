import ConfigService from "../services/ConfigService";
import logger from "../services/LoggerService";
import { ImageRegistryAdapter } from "./ImageRegistryAdapter";

const config = ConfigService.getConfig();

export class GithubAdapter extends ImageRegistryAdapter {
    private tag: string;
    private accessToken: string | undefined;
    /** The actual installed semver, which may differ from `tag` when tag is 'latest'. */
    private installedVersion: string;

    constructor(image: string, tag: string = 'latest', _accessToken?: string, installedVersion?: string) {
        const accessToken =  config?.accessTokens?.github;

        super(image, accessToken);
        this.tag = tag;
        this.accessToken = accessToken;
        // Fall back to the Docker tag when no explicit version is provided
        this.installedVersion = installedVersion || tag;

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

                // Fetch all release notes between the installed version and the latest
                let releaseNotes: string | undefined = undefined;
                let repoUrl: string | undefined = undefined;
                try {
                    const imageNameWithTag = this.image.split(':')[0];
                    const [registry, user, image] = imageNameWithTag.split('/');
                    repoUrl = `https://github.com/${user}/${image}`;

                    // Create headers for GitHub API
                    const githubHeaders: any = {
                        'Accept': 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    };
                    if (this.accessToken) {
                        githubHeaders['Authorization'] = `Bearer ${this.accessToken}`;
                    }

                    // Fetch up to 50 most recent releases (newest first)
                    const releasesApiUrl = `https://api.github.com/repos/${user}/${image}/releases?per_page=50`;
                    const releasesResponse = await this.http.get(releasesApiUrl, { headers: githubHeaders });

                    if (releasesResponse.data && Array.isArray(releasesResponse.data) && releasesResponse.data.length > 0) {
                        const releases: any[] = releasesResponse.data;

                        // Normalise a version string for reliable comparison:
                        //  • strip leading 'v'
                        //  • strip semver build metadata  (+abc1234)
                        //  • strip LinuxServer.io suffixes (-ls123, -r2-ls447, etc.)
                        //  • trim whitespace
                        const normalise = (t: string): string => t
                            .replace(/^v/i, '')
                            .replace(/\+.*$/, '')          // semver build metadata
                            .replace(/-ls\d+.*$/i, '')     // LinuxServer.io  -ls342
                            .replace(/-r\d+(-ls\d+.*)?$/i, '') // Alpine rev  -r2 / -r2-ls447
                            .trim();

                        // Reduce a version string to its first 3 numeric components for
                        // a loose partial match (e.g. "0.24.5.0" ≈ "0.24.5").
                        const toThreePart = (v: string): string => v.split('.').slice(0, 3).join('.');

                        // Branch / channel names are NOT version numbers and cannot be
                        // matched against GitHub release tags.
                        const CHANNEL_RE = /^(master|main|develop(ment)?|nightly|rolling|stable|edge|beta|alpha|release|next|preview|canary|head|trunk)$/i;
                        const isChannelName = (v: string): boolean =>
                            CHANNEL_RE.test(v) || !/\d/.test(v);  // no digit → not a version

                        // Prefer the label-resolved version; fall back to the Docker tag.
                        const effectiveVersion = (this.installedVersion && this.installedVersion !== 'latest')
                            ? this.installedVersion
                            : this.tag;

                        logger.debug(`Release note filtering for ${user}/${image}: docker tag="${this.tag}", installedVersion="${this.installedVersion}", effectiveVersion="${effectiveVersion}"`);
                        logger.debug(`Available releases: ${releases.slice(0, 5).map((r: any) => r.tag_name).join(', ')}${releases.length > 5 ? '…' : ''}`);

                        let relevantReleases: any[];

                        const canMatchVersion = effectiveVersion &&
                            effectiveVersion !== 'latest' &&
                            !isChannelName(effectiveVersion);

                        if (canMatchVersion) {
                            const normEffective = normalise(effectiveVersion);

                            // 1. Try exact match after normalisation
                            let installedIndex = releases.findIndex(
                                (r: any) => normalise(r.tag_name || '') === normEffective
                            );

                            // 2. If no exact match, try a 3-part semver partial match
                            //    so that "0.24.5.0" matches a release tagged "v0.24.5"
                            if (installedIndex === -1) {
                                const eff3 = toThreePart(normEffective);
                                installedIndex = releases.findIndex(
                                    (r: any) => toThreePart(normalise(r.tag_name || '')) === eff3
                                );
                                if (installedIndex !== -1) {
                                    logger.debug(`Partial semver match: "${normEffective}" matched release "${releases[installedIndex].tag_name}" on first 3 components`);
                                }
                            }

                            logger.debug(`Looking for version "${normEffective}" in releases → index ${installedIndex}`);

                            if (installedIndex > 0) {
                                relevantReleases = releases.slice(0, installedIndex);
                                logger.info(`Found ${relevantReleases.length} release(s) newer than ${effectiveVersion} for ${user}/${image}`);
                            } else if (installedIndex === 0) {
                                relevantReleases = [];
                                logger.info(`Image ${user}/${image} is already on the latest release (${effectiveVersion})`);
                            } else {
                                // Version not found – may be a CalVer/non-semver scheme that
                                // differs from the GitHub release tags.  Show 5 recent releases.
                                relevantReleases = releases.slice(0, 5);
                                logger.warn(`Installed version "${effectiveVersion}" not found in releases for ${user}/${image} – showing ${relevantReleases.length} most recent release(s) as fallback`);
                            }
                        } else {
                            // Channel name (master/main/nightly…) or 'latest' with no label –
                            // we cannot determine which release is installed; show 5 recent ones.
                            relevantReleases = releases.slice(0, 5);
                            logger.info(`No specific version for ${user}/${image} (effectiveVersion="${effectiveVersion}") – showing ${relevantReleases.length} most recent release(s)`);
                        }

                        if (relevantReleases.length > 0) {
                            releaseNotes = relevantReleases
                                .map((r: any) => `## ${r.tag_name}\n${(r.body || '').trim()}`)
                                .join('\n\n---\n\n');
                            logger.info(`Fetched release notes for ${user}/${image} (${relevantReleases.length} version(s))`);
                        }
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
