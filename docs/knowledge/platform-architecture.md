# Platform Architecture and What It Does Not Prove

## What the unified environment contains

A single monorepo holds the application, the shared security modules, the development container definition, the CI pipeline, the infrastructure contract and the documentation. Anyone who clones it lands on the same tool versions, which removes the "it works on my machine" conversation.

## Three layers of gates

1. Before a commit: Gitleaks scans the staged content and stops credentials from entering the commit.
2. Before a merge: GitHub Actions runs the tests, a secret scan over the full history, Terraform validation, dependency and image vulnerability scans, and CodeQL analysis. A merge requires the required checks to pass and a review to be complete.
3. Before a run: the container starts as a non-root user with a read-only filesystem, all capabilities dropped, CPU and memory limits, bound to loopback only.

## Verified and not verified

This prototype has actually verified: the Node 22.22.2 runtime, the test suite, a synthetic secret being blocked, the repaired input being allowed, the staged-index bypass defence, the source scan, the Terraform format check and the Compose configuration parse.

Still unverified, or requiring the customer environment: the container build and image vulnerability scan, Terraform initialisation and full validation, GitHub Actions and CodeQL actually running, and branch protection being enabled. A tool that installed successfully is not a check that passed, and a configuration that has been written is not a control that is in force.

## What is out of scope

This prototype does not include a Kubernetes cluster, cloud resources, an identity system, single sign-on, an audit platform or production-grade high availability. Those belong to a later stage and depend on the customer's network boundary, code platform and licensing.
