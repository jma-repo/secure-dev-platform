# Internal AI Usage Boundaries

## What is allowed

The team may use a model deployed on the internal network or on the local machine to work with internal material, provided the data never leaves the controlled network. This prototype loads a Qwen model and a local embedding model through LM Studio on the local machine; both inference and vector search go through `127.0.0.1` only and call no cloud service.

Permitted uses include looking up internal policy, explaining a scan result, drafting a commit message and tidying up a troubleshooting record.

## What is not allowed

- Do not paste real credentials, customer personal data or unredacted production logs into any external online AI service.
- Do not submit internal code to a public model endpoint unless written approval and a data classification review are already in place.
- Do not let AI output replace human review, a compliance decision or a security approval.
- Do not let a model run commands, change permissions or operate a production environment directly.

## A note on Copilot Studio

Copilot Studio is not "training a model from scratch". It is a low-code platform that connects internal data sources to an existing model and answers questions or automates a flow through retrieval and prompts. It needs the corresponding Microsoft licence, and the data usually sits in the Microsoft cloud.

If the customer requires that code and material never leave the internal network, a cloud Copilot Studio deployment may conflict with that requirement. The alternative is an internally hosted retrieval stack: local documents, a local embedding model, a local generation model, plus identity and audit.

## Limits of the local RAG

This prototype reads only the sample material under `docs/knowledge` and in the README, and every answer is grounded in the retrieved passages. Where the material says nothing, the assistant must say "the material does not cover this" rather than inventing a rule, a command or an approval path. Model output is not a security conclusion.
