# Administration app home

Administration currently consists of host-application modules and authorization/configuration workflows. No separate Admin deployment is established by the reviewed source.

CRM examples include `packages/sales-workspace/src/components/sales/RepAccessAdmin.tsx`, server dispatch in `packages/crm-server/src/http.ts`, weekly admin review tests/migrations and the host's settings/access flows. Command Center administration/system work remains under [command-center](../command-center/).

Local `crm-source` and `cc-source` links open the owning source trees. Do not copy shared authentication, permissions or SQL into a second standalone application merely to populate this folder.
