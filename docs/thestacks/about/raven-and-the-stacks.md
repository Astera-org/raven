---
description: How Raven, the software, relates to The Stacks, the website.
---

(about:raven-and-the-stacks)=

# Raven and The Stacks

Raven is the backend that powers The Stacks.
The Stacks is an _opinionated deployment of Raven_, and is Astera's hosted service for the Astera and Arcadia communities.
The Stacks is a "lighthouse customer" that drives Raven's development, and demonstrates some things you can do with it.

Any organization can [deploy its own Raven instance](xref:raven/deployers).
This allows you to change the workflow, UI, publishing policies, or access controls to suit your needs.

The project is split across two repositories:

- [Raven](https://github.com/Astera-org/raven) has the backend API and database, the [admin UI](xref:raven#admins:admin-ui), and the `raven` CLI.
- [thestacks](https://github.com/Astera-org/thestacks) has the website, which renders publications ([see how rendering works](xref:raven#developers:myst-publications)), and hosted services like PDF generation. It gets its data from Raven's [HTTP API](https://api.thestacks.org/api/v1/docs).
