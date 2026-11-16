#!/bin/sh
# The SDK is archived into the pod, but Bundle.module looks in the final app.
# Copy the complete upstream SPM bundle, including its privacy manifest.
set -eu

bundle='TajweedFormer_TajweedFormer.bundle'
source="${BUILT_PRODUCTS_DIR:?BUILT_PRODUCTS_DIR is required}/${bundle}"
destination="${TARGET_BUILD_DIR:?TARGET_BUILD_DIR is required}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?UNLOCALIZED_RESOURCES_FOLDER_PATH is required}/${bundle}"

if [ ! -d "$source" ] || [ ! -f "$source/PrivacyInfo.xcprivacy" ]; then
  echo "error: QuralingoRecitation SDK resource bundle/privacy manifest missing: $source" >&2
  exit 1
fi
mkdir -p "$(dirname "$destination")"
/usr/bin/ditto "$source" "$destination"
