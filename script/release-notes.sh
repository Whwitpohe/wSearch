#!/usr/bin/env bash
set -euo pipefail

tag=${1:?release tag required}
destination=${2:?output file required}
notes="docs/releases/$tag.md"
if [[ -f "$notes" ]]; then
  grep -Fxq '## 中文' "$notes"
  grep -Fxq '## English' "$notes"
  cp "$notes" "$destination"
  exit 0
fi

# The tag's diff also works for releases without authored per-version notes.
history="https://github.com/$GH_REPO/commits/$tag/"
if previous=$(gh release view --json tagName --jq .tagName) && [[ "$previous" != "$tag" ]]; then
  history="https://github.com/$GH_REPO/compare/$previous...$tag"
fi
cat > "$destination" <<EOF
## 中文

wSearch $tag 的桌面安装包见下方文件列表。请按操作系统和处理器选择包。

[本版本代码变更]($history) · [项目更新记录](https://github.com/$GH_REPO/blob/master/CHANGELOG.md)

## English

The desktop packages for wSearch $tag are listed under Assets. Choose the package matching your operating system and processor.

[Changes in this version]($history) · [Project changelog](https://github.com/$GH_REPO/blob/master/CHANGELOG.md)
EOF
