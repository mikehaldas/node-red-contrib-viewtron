#!/bin/sh
# Fail unless TAG is vX.Y.Z and package.json version is X.Y.Z.
set -eu

if ! printf '%s' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "::error::Tag '$TAG' is not in vX.Y.Z form"
  exit 1
fi

version=${TAG#v}
pkg_version=$(node -p "require('./package.json').version")

if [ "$pkg_version" != "$version" ]; then
  echo "::error::Tag $TAG does not match package.json version $pkg_version (expected $version)"
  exit 1
fi

echo "Tag $TAG matches package.json version $pkg_version"
