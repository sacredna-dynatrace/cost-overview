# Cost Overview — Dynatrace App

Dynatrace 사용 비용을 **cost center(비용 부서)**, **capability(기능)**, **환경(tenant)** 별로 보여주는 Dynatrace 앱입니다.
dt-app, React, Strato Design System으로 만들었습니다.

> 예시용으로 만든 앱이며 계속 개선하고 있습니다. 화면의 비용은 기본적으로 **예상 비용**입니다. 실제 청구 금액과 다를 수 있습니다. 자세한 내용은 [한계](#한계)를 참고하세요.

## 5분 요약

- **무엇을 보여주나요?** 어느 부서(cost center)가 어떤 기능(capability)에 얼마를 쓰는지 보여줍니다. 계정 전체와 환경별 비용도 보여줍니다.
- **무엇이 필요한가요?** Dynatrace SaaS 환경(3세대 플랫폼), 앱 배포 권한, Node.js 20 이상이 필요합니다.
- **설치 순서**
  1. `app.config.json`에 내 환경 주소를 넣고 `npm run deploy`를 실행합니다.
  2. IAM 정책 2종(관리자용, 일반 사용자용)을 만들어 그룹에 연결합니다.
  3. (선택) Account Management API용 OAuth client를 만들고, 앱의 **Account → Connection**에 입력합니다.
  4. 앱을 열어 확인합니다.

## 용어

| 용어 | 뜻 |
| --- | --- |
| Cost center | 비용을 나누는 단위(부서, 팀 등)입니다. 현재 환경에서는 호스트 이름을 cost center로 씁니다(MVP). 계정 화면에서는 `dt.cost.costcenter` 태그나 cost allocation 값을 씁니다. |
| Capability | Dynatrace 과금 항목입니다. 예: Full-Stack Monitoring, Log Management. |
| Rate card | capability별 단가표입니다. 기본값은 DPS 리스트 가격(USD)이고, 관리자가 계약 단가로 바꿀 수 있습니다. |
| unassigned | cost center를 알 수 없는 사용량입니다. 예: 태그가 없는 사용량, 호스트와 관계없는 RUM, Synthetic 등. |
| 관리자 | `account-connection` 설정에 쓰기 권한이 있는 사용자입니다. 아래 IAM 정책으로 지정합니다. |

## 화면 구성

| 화면 | 사용자 | 내용 |
| --- | --- | --- |
| **Account** | 관리자 | 계정 전체 비용을 보여줍니다. 예산 사용률, 남은 약정 일수, 환경별 일별 추이를 볼 수 있습니다. 표에서 환경을 펼치면 cost center가 보입니다. cost center를 누르면 상세 화면이 열리고, 환경을 누르면 그 환경의 Overview로 이동합니다. |
| **Overview** | 전체 | 현재 환경의 비용입니다. KPI, 이전 기간과 비교한 추이, 카테고리별 비율, cost center 목록(50개씩)을 보여줍니다. 행을 누르면 상세 화면이 열립니다. |
| **Usage Attribution** | 전체 | cost center × capability 표입니다. 비용이나 사용량으로 볼 수 있고 20개씩 보여줍니다. CSV로 내려받을 수 있습니다. |
| **Coverage** | 전체 | 사용량 중 cost center가 지정된 비율을 보여줍니다. |
| **Rate Card** | 관리자 | capability별 단가를 수정합니다. 수정한 단가는 모든 사용자에게 똑같이 적용됩니다. |

관리자는 Overview와 Usage Attribution 상단에서 **다른 환경**을 고를 수 있습니다. 이때 데이터는 Account Management API에서 가져옵니다.

## 데이터는 어디서 오나요?

- **현재 환경**: Grail의 과금 사용량 이벤트에 Rate card 단가를 곱해서 계산합니다.
  - 사용한 쿼리: `fetch dt.system.events | filter event.kind == "BILLING_USAGE_EVENT"`
  - Traces와 Metrics 수집량은 *DPS Cost Allocation Overview* 대시보드(v3.11)와 같은 방식으로 나눕니다. `dt.cost.costcenter` 태그 기준으로 나누고, 태그가 없으면 `unassigned`로 둡니다.
- **계정 전체와 다른 환경**: 앱 함수 [`api/account-cost.function.ts`](api/account-cost.function.ts)가 [Account Management API](https://docs.dynatrace.com/docs/manage/account-management/account-api)를 호출해서 가져옵니다.
  - 환경별, 날짜별, capability별 사용량을 가져옵니다.
  - 청구 비용이 있으면 그 금액을 쓰고, 없으면 **사용량 × Rate card**로 계산합니다.
  - cost allocation 데이터가 있으면 cost center별로 나누고, 나뉘지 않은 나머지는 `unassigned`로 둡니다.
  - 연결 설정이 없거나 오류가 나면 **예시 데이터**(가상의 환경 ID)를 보여줍니다.

## 설치 방법

### 1. 배포

```bash
npm install
```

[`app.config.json`](app.config.json)의 `environmentUrl`을 내 환경 주소로 바꿉니다.

```json
"environmentUrl": "https://<your-environment-id>.apps.dynatrace.com/"
```

필요하면 `app.id`(기본값 `my.cost.overview`)도 바꿀 수 있습니다. 바꾼 경우 아래 IAM 정책의 `my.cost.overview`도 같은 값으로 바꿔 주세요.

```bash
npm run deploy
```

### 2. IAM 정책

**Account Management → Identity & access management → Policies**에서 정책을 만들고 그룹에 연결합니다.

**관리자용**(예: Finance Admin 그룹): Account 화면, Rate Card 수정, Connection 설정에 쓰입니다.

```text
ALLOW app-settings:objects:read, app-settings:objects:write WHERE shared:app-id = "my.cost.overview" AND settings:schemaId = "account-connection";
ALLOW app-settings:objects:read, app-settings:objects:write WHERE shared:app-id = "my.cost.overview" AND settings:schemaId = "rate-card";
```

**일반 사용자용**: 공용 Rate card를 읽을 때 쓰입니다.

```text
ALLOW app-settings:objects:read WHERE shared:app-id = "my.cost.overview" AND settings:schemaId = "rate-card";
```

일반 사용자에게는 앱 실행 권한과 Grail 과금 이벤트 읽기 권한도 필요합니다. 기본 *Standard User* 정책에 보통 포함되어 있습니다.

### 3. Account Management API 연결 (선택, 관리자)

Account 화면과 다른 환경 보기에만 필요합니다. 설정하지 않으면 이 화면들에 예시 데이터가 보입니다.

1. **Account Management → Identity & access management → OAuth clients**에서 OAuth client를 만듭니다. 권한(scope)은 **`account-uac-read`**와 **`account-env-read`**를 선택합니다.
2. 환경의 **Settings → General → External requests (Limit outbound connections)**에서 **`sso.dynatrace.com`**과 **`api.dynatrace.com`**을 허용합니다.
3. 앱에서 **Account → Connection**을 열고 Account UUID, Client ID, Client secret을 입력한 뒤 저장합니다.
   - secret은 암호화된 앱 설정으로 저장됩니다. 화면에는 다시 보이지 않습니다.
   - 패널 상단에서 연결 상태(Connected / 실패 / 미설정)를 확인할 수 있습니다.

## 개발

```bash
npm run start   # 개발 서버 실행 (수정하면 바로 반영)
npm run lint    # 오류 없이 통과해야 함
npm run build   # 오류 없이 통과해야 함
```

| 경로 | 내용 |
| --- | --- |
| `ui/app/pages/` | 화면 (Account, Overview, Attribution, Coverage, RateCard) |
| `ui/app/components/` | 툴바, KPI 카드, 상세 화면, 연결 설정 화면 |
| `ui/app/cost/` | DQL 쿼리, 수집량 배분, 단가표, 숫자 표시, 공통 데이터 |
| `ui/app/account/` | Account API 데이터 변환, 예시 데이터, `useAccountCost` hook |
| `ui/app/settings/` | 앱 설정 (Rate card, 관리자 판별) |
| `api/` | Account Management API를 호출하는 앱 함수 |
| `settings/schemas/` | 앱 설정 스키마 (`rate-card`, `account-connection`) |

[`AGENTS.md`](AGENTS.md)와 [`CLAUDE.md`](CLAUDE.md)는 AI 코딩 도구가 이 저장소에서 작업할 때 따르는 규칙입니다.

## 한계

- 단가는 DPS **리스트 가격(USD)** 기준입니다. 계약 단가와 다르면 Rate Card 화면에서 바꿔 주세요.
- 현재 환경의 cost center는 호스트 이름입니다(MVP). 호스트가 없는 사용량(RUM, Synthetic, Automation, Grail 보존 등)은 `unassigned`로 표시됩니다.
- 청구 비용(`/environments/cost`)과 cost allocation 응답은 데이터가 비어 있는 계정에서만 시험했습니다. 실제 청구 데이터로는 아직 확인하지 못했습니다.
- 과금 사용량은 늦게 집계되기 때문에 최근 24시간은 제외합니다.
