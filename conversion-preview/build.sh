#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p dist
rsync -a --exclude=.DS_Store ../assets dist/
rsync -a --exclude=.DS_Store ../samla dist/
cp ../index.html ../community.html ../coach.html ../coaches.html ../pacer.html ../pacer-profile.html ../run-iq.html ../dashboard.html ../privacy.html ../terms.html ../training-programmes.html ../admin.html ../events.html ../marketplace.html ../providers.html ../blog.html ../athlete-studio.html ../coach-studio.html manifest.json sw.js _headers preview-checkout.html preview-account.html dist/
