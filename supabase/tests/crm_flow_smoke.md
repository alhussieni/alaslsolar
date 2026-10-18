# CRM smoke checklist (run on staging, or manually after deploy)

Verified on production data on 2026-10-18 inside a transaction that was rolled back (synthetic users):

| Actor | Action | Expected |
|---|---|---|
| owner rep | add activity, set quote status, add follow-up | allowed |
| owner rep | assign customer, call `crm_rep_overview` | blocked (42501) |
| other rep | add activity / set status / complete follow-up on someone else's customer | blocked (42501); sees 0 activities, 0 follow-ups |
| sales_manager | assign customer to active rep | allowed; open follow-ups move to the new rep |
| sales_manager | assign to a non-rep uuid, set invalid status | blocked (22023) |
| admin (no legacy admin) | `crm_rep_overview`, read follow-ups | allowed |
| anon | any CRM RPC / table | blocked |

Manual UI checks after deploying `QL/rep-customers.html`:
1. Rep: sees only own customers; cannot see the "assign" box or the performance table.
2. Manager/Admin: sees the performance table and the assign box; assigning moves the customer.
3. Change a quote status -> timeline shows "status_change".
