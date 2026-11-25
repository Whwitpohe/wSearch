import { afterEach, expect, it, vi } from "vitest";
import { fetchAppReleases, releasePage, releasePath } from "../lib/appRelease";

afterEach(() => vi.unstubAllGlobals());
it("reads the fork and treats zero public releases as a successful check", async () => {
    const get = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", get);
    expect(await fetchAppReleases("https://mirror.invalid/api")).toEqual([]);
    expect(get.mock.calls[0]).toContain(
        "https://api.github.com/repos/Whwitpohe/wSearch/releases",
    );
    expect(get).toHaveBeenCalledTimes(1);
});
it("tries the configured mirror on transport failure and uses fork-owned download links", async () => {
    const get = vi
        .fn()
        .mockRejectedValueOnce(Error("offline"))
        .mockResolvedValueOnce(
            Response.json([
                {
                    tag_name: "v15.9.0",
                    name: "November update",
                    draft: false,
                    assets: [
                        {
                            name: "installer",
                            browser_download_url: `${releasePage}/download/v15.9.0/setup.exe`,
                        },
                        {
                            name: "other",
                            browser_download_url:
                                "https://example.org/setup.exe",
                        },
                    ],
                },
                { tag_name: "99", draft: true },
            ]),
        );
    vi.stubGlobal("fetch", get);
    const mirror = `https://mirror.invalid/${releasePath}`;
    const [r] = await fetchAppReleases(mirror);
    expect(get.mock.calls[1][0]).toBe(mirror);
    expect(r.name).toBe("15.9.0");
    expect(r.html_url).toBe(`${releasePage}/tag/v15.9.0`);
    expect(r.assets.map((a) => a.name)).toEqual(["installer"]);
});
