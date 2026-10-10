# Build a clean transfer archive

Build transfer archives with the package-owned builder. It disables macOS copy-file metadata, excludes extended attributes, verifies the source package before packing it, rejects AppleDouble, Finder, and `__MACOSX` entries after packing, and prints the archive's Secure Hash Algorithm 256-bit (`SHA-256`) digest.

```bash
deployment/remote/orgo/maya-template/scripts/create-transfer-archive.sh \
  deployment/remote/orgo/maya-template \
  /private/tmp/maya-runtime-transfer.tar.gz
```

The destination path must not already exist. Record the printed digest before transfer, verify the received archive against it, and run `scripts/verify-package.mjs` again after extraction. Never install an archive that contains `._*`, `.DS_Store`, `__MACOSX`, a symbolic link, or another non-regular package entry.
