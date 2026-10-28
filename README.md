# Cost Overview — Dynatrace App

A Dynatrace AppEngine app that shows Dynatrace platform cost per **cost center**, **capability** and **environment**. It is built with dt-app, React and the Strato Design System.

> Status: example / work in progress. Costs are **estimates** unless the Account Management API returns billed cost. See [Limitations](#limitations).

## Pages

| Page | Who | What it shows |
| --- | --- | --- |
| **Account** | Admins | Cost across all environments of the account: KPIs, budget, days left in the commit period, and a daily trend by environment. The table expands each environment into its cost centers. Select a cost center to open a detail sheet with its trend, capabilities, and the same cost center in other environments. Select an environment to open it on Overview. |
| **Overview** | Everyone | Cost of the environment, with KPIs, the trend vs. the previous period, the split by category, and a list of all cost centers (50 per page). Select a row to open a detail sheet. |
| **Usage Attribution** | Everyone | Pivot of cost centers × capabilities (cost or usage), 20 per page, with CSV download. |
| **Coverage** | Everyone | Share of usage that is attributed to a cost center. |
| **Rate Card** | Admins | Price per capability (DPS list prices in USD by default). Custom prices are shared with all users. |

Admins can also pick another environment of the account in the toolbar of Overview and Usage Attribution. Its data then comes from the Account Management API.

## Data sources

- **Current environment**: billing usage events in Grail (`fetch dt.system.events | filter event.kind == "BILLING_USAGE_EVENT"`), priced with the rate card.
  - Cost center = host name (MVP).
  - Traces and metrics ingest are normalized the same way as the *DPS Cost Allocation Overview* dashboard (v3.11). They are attributed with the `dt.cost.costcenter` tag, or to `unassigned` if the tag is missing.
- **Account and other environments**: the [Account Management API](https://docs.dynatrace.com/docs/manage/account-management/account-api), called by the app function [`api/account-cost.function.ts`](api/account-cost.function.ts).
  - Usage per environment, day and capability.
  - Billed cost when the subscription provides it, otherwise usage × rate card.
  - Cost allocation per cost center (`/v1/subscriptions/{id}/cost-allocation`). Usage that is not allocated stays `unassigned`.
  - If no connection is configured, or the request fails, the account views show **example data** with fictional environment IDs.

## Installation

### 1. Prerequisites

- Node.js 20+ and access to a Dynatrace SaaS environment (3rd gen platform) with permission to deploy apps.

### 2. Configure and deploy

```bash
npm install
```

Set your environment in [`app.config.json`](app.config.json):

```json
"environmentUrl": "https://<your-environment-id>.apps.dynatrace.com/"
```

Optionally change `app.id` (default `my.cost.overview`). If you change it, use the new ID in the IAM policies below.

```bash
npm run deploy
```

### 3. IAM policies

Who counts as an admin is decided by **write access to the `account-connection` settings schema**. Create these policies in Account Management → Identity & access management → Policies, and bind them to groups.

**Cost admins** (e.g. a "Finance Admin" group): the Account page, the Rate Card editor, and the connection settings.

```text
ALLOW app-settings:objects:read, app-settings:objects:write WHERE shared:app-id = "my.cost.overview" AND settings:schemaId = "account-connection";
ALLOW app-settings:objects:read, app-settings:objects:write WHERE shared:app-id = "my.cost.overview" AND settings:schemaId = "rate-card";
```

**All app users**: read the shared rate card.

```text
ALLOW app-settings:objects:read WHERE shared:app-id = "my.cost.overview" AND settings:schemaId = "rate-card";
```

App users also need permission to run the app and to read billing events in Grail, e.g. through the default *Standard User* policies.

### 4. Account Management API connection (optional, admins)

This step is needed only for the Account page and for other environments. Without it, these views show example data.

1. In Account Management → Identity & access management → OAuth clients, create a client with the scopes **`account-uac-read`** and **`account-env-read`**.
2. In the environment, go to Settings → General → External requests (Limit outbound connections) and allow **`sso.dynatrace.com`** and **`api.dynatrace.com`**.
3. In the app, open **Account → Connection**. Enter the account UUID, client ID and client secret, then save.
   - The secret is stored as a secret app setting. Only the app function can read it in plain text.
   - The panel shows the connection status (connected / failed / not configured).

## Development

```bash
npm run start   # dev server with hot reload
npm run lint    # must pass
npm run build   # must pass
```

| Path | Content |
| --- | --- |
| `ui/app/pages/` | Pages (Account, Overview, Attribution, Coverage, RateCard) |
| `ui/app/components/` | Toolbar, KPI cards, detail sheets, connection sheet |
| `ui/app/cost/` | DQL queries, normalization, rate card, formatting, data context |
| `ui/app/account/` | Account API mapping, example data, `useAccountCost` hook |
| `ui/app/settings/` | App settings (rate card, admin detection) |
| `api/` | App function for the Account Management API |
| `settings/schemas/` | App settings schemas (`rate-card`, `account-connection`) |

[`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md) hold the conventions for AI coding agents working on this repository.

## Limitations

- Prices are DPS **list prices in USD**. Adjust them on the Rate Card page to match the contract.
- The cost center of the current environment is the host name (MVP). Usage without a host (e.g. RUM, Synthetic, Automation, Grail retention) is `unassigned`.
- Billed cost (`/environments/cost`) and cost allocation responses have only been tested with an account that returns empty data. Their parsing is defensive but not yet checked against real billed data.
- The last 24 hours are excluded because billing usage is reported with a delay.
