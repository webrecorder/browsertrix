---
hide:
    - toc
---

# Developing Browsertrix Cloud

Browsertrix Cloud consists of a Python-based backend and TypeScript-based frontend.

To develop Browsertrix Cloud, the system must [first be deployed locally](../deploy/local.md) in a Kubernetes cluster.

The deployment can then be [further customized for local development](./local-dev-setup.md).

### Backend

The backend is an API-only system, using the FastAPI framework. The latest API reference is available
under ./api of a running cluster.

At this time, the backend must be deployed in the Kubernetes cluster.

<!-- *TODO Add additional info here* -->

### Frontend

The frontend UI is implemented in TypeScript, using the Lit framework and Shoelace component library.

The static build of the frontend is bundled with nginx, but the frontend can be deployed locally in dev mode against an existing backend.

See [Running Frontend](./frontend-dev) for more details.

<!-- *TODO Add additional info here* -->
