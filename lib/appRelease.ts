import pkg from "../package.json";

export const projectUrl = pkg.homepage.replace(/\/$/, "");
export const releasePage = `${projectUrl}/releases`;
export const releasePath = `repos/${new URL(projectUrl).pathname.slice(1)}/releases`;

type Release = {
    name: string;
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    html_url: string;
    body: string;
    assets: { name: string; browser_download_url: string }[];
};
export async function fetchAppReleases(mirror: string): Promise<Release[]> {
    let last: unknown;
    for (const url of new Set([
        `https://api.github.com/${releasePath}`,
        mirror,
    ])) {
        try {
            const response = await fetch(url, {
                headers: { Accept: "application/vnd.github+json" },
                signal: AbortSignal.timeout(8000),
            });
            if (!response.ok) throw Error(`HTTP ${response.status}`);
            const releases: unknown = await response.json();
            if (!Array.isArray(releases)) throw Error("Invalid release list");
            return releases
                .filter(
                    (r: Release) =>
                        typeof r?.tag_name === "string" &&
                        /^v?\d/.test(r.tag_name) &&
                        !r.draft,
                )
                .map((r: Release) => ({
                    ...r,
                    name: r.tag_name.replace(/^v/, ""),
                    body: r.body || "",
                    html_url: `${releasePage}/tag/${encodeURIComponent(r.tag_name)}`,
                    assets: (r.assets || []).filter((a) =>
                        a.browser_download_url.startsWith(
                            `${releasePage}/download/`,
                        ),
                    ),
                }));
        } catch (error) {
            last = error;
        }
    }
    throw last;
}
