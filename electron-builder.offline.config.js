const standard = require("./electron-builder.config.js");

module.exports = {
    ...standard,
    directories: { ...standard.directories, output: "build/offline" },
    extraMetadata: { bundledOcr: true },
    artifactName:
        "${productName}-${version}-${platform}-${arch}-offline.${ext}",
    ...Object.fromEntries(
        ["win", "linux", "mac"].map((platform) => [
            platform,
            {
                ...standard[platform],
                files: standard[platform].files.filter(
                    (pattern) => pattern !== "!assets/onnx/ppocr/**/*",
                ),
            },
        ]),
    ),
};
