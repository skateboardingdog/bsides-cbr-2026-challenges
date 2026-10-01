#!/usr/bin/env sh

set -euo pipefail

sed '/^ENV FLAG=/c\ENV FLAG=skbdg{redacted}' Dockerfile > Dockerfile.publish
zip handout.zip app.py Dockerfile.publish hint.odp
mv handout.zip ../publish/
rm Dockerfile.publish
