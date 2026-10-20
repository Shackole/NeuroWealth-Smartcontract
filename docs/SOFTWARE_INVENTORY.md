# Release Software Inventories

`.github/workflows/release-sbom.yml` runs for a published GitHub release and
checks out the exact tagged commit. It generates CycloneDX JSON inventories
from the repository dependency manifests/lockfiles and from the built agent
and monitoring runtime images. The release asset and immutable workflow
artifact names include the release commit SHA. The workflow uses public package
registries and does not require registry credentials.

The Node service lockfiles are committed beside their manifests; Rust workspace
dependencies are captured by `neurowealth-vault/Cargo.lock`. When dependency
manifests change, regenerate and commit their lockfiles before publishing a
release. Never publish a release SBOM from an untagged or uncommitted working
tree.

See [`RELEASE_PROVENANCE.md`](RELEASE_PROVENANCE.md) for deployment artifact
hashes, revision references, and rollback limits.
