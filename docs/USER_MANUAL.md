# Jungle Tools 종합 사용자 매뉴얼 (User Manual)

Jungle Tools는 멀티 계정 AWS 클라우드 환경에서 **VPC 보안 그룹(Security Group) 라이프사이클 관리**, **WORM S3 Object Lock 규정 준수 감사 로깅**, **멀티 서비스(EBS, EFS, RDS) 백업 통합 관제**, 그리고 **Slack/Email 지능형 알림 자동화**를 제공하는 엔터프라이즈급 클라우드 관리 콘솔입니다.

---

## 목차 (Table of Contents)

1. [시스템 아키텍처 및 보안 개요](#1-시스템-아키텍처-및-보안-개요)
2. [공통 레이아웃 및 글로벌 UI 요소](#2-공통-레이아웃-및-글로벌-ui-요소)
   - [2.1 좌측 사이드바 (Left Sidebar)](#21-좌측-사이드바-left-sidebar)
   - [2.2 상단 헤더 바 (Top Header Bar)](#22-상단-헤더-바-top-header-bar)
   - [2.3 인증 및 로그인 모달 (Auth Modal)](#23-인증-및-로그인-모달-auth-modal)
   - [2.4 알림 및 토스트 메시지](#24-알림-및-토스트-메시지)
3. [화면 및 메뉴별 상세 기능 설명](#3-화면-및-메뉴별-상세-기능-설명)
   - [3.1 홈 대시보드 (Home)](#31-홈-대시보드-home)
   - [3.2 보안 그룹 대시보드 (SG Manage > Dashboard)](#32-보안-그룹-대시보드-sg-manage--dashboard)
   - [3.3 보안 그룹 감사 로그 (SG Manage > Logs)](#33-보안-그룹-감사-로그-sg-manage--logs)
   - [3.4 백업 관제 대시보드 (Backup Monitor > Dashboard)](#34-백업-관제-대시보드-backup-monitor--dashboard)
   - [3.5 Slack 웹훅 설정 (Backup Monitor > Notification > Slack > 웹훅)](#35-slack-웹훅-설정-backup-monitor--notification--slack--웹훅)
   - [3.6 Slack Email 설정 (Backup Monitor > Notification > Slack > Email)](#36-slack-email-설정-backup-monitor--notification--slack--email)
   - [3.7 SMTP 서버 설정 (Backup Monitor > Notification > Email > SMTP)](#37-smtp-서버-설정-backup-monitor--notification--email--smtp)
   - [3.8 이메일 주소 등록 (Backup Monitor > Notification > Email > 주소 등록)](#38-이메일-주소-등록-backup-monitor--notification--email--주소-등록)
4. [주요 운영 시나리오 가이드](#4-주요-운영-시나리오-가이드)
5. [자주 묻는 질문 및 문제 해결 (FAQ & Troubleshooting)](#5-자주-묻는-질문-및-문제-해결-faq--troubleshooting)

---

## 1. 시스템 아키텍처 및 보안 개요

Jungle Tools는 안전하고 확장성 높은 서버리스 및 BFF(Backend-for-Frontend) 아키텍처로 설계되었습니다:

```
[사용자 브라우저]
  │  ▲
  │  │ (1) STS GetCallerIdentity 인증 및 세션 쿠키 발급
  │  │ (2) HttpOnly, Secure, SameSite=None 세션 쿠키 전달
  ▼  │ (3) credentials: 'include'를 통한 모든 API 호출
[Amazon API Gateway v2 (HTTP API)]
  │
  ├──► [Lambda Request Authorizer (AuthAuthorizerFunction)]
  │      └─► DynamoDB (UserSessionsTable - 256비트 암호화 세션 & TTL 만료)
  │
  ├──► [BFF 인증 핸들러 (Login, Logout, Me)]
  │      └─► AWS STS 검증
  │
  ├──► [비즈니스 로직 Lambdas]
  │      ├─► 허브/스포크 계정 AssumeRole (정규식 검증 보안 적용)
  │      ├─► EC2 보안 그룹 및 인바운드/아웃바운드 방화벽 제어
  │      ├─► EBS / EFS / RDS 백업 현황 실시간 스캔
  │      └─► Slack Incoming Webhook / SES Email 자동 발송
  │
  └──► [데이터 저장소]
         ├─► DynamoDB: 실시간 세션, 감사 로그, 알림 설정
         └─► S3 Bucket (Object Lock WORM): 변조 불가 감사 로그 보존
```

---

## 2. 공통 레이아웃 및 글로벌 UI 요소

모든 화면에서 일관되게 제공되는 상단 및 좌측 네비게이션 요소입니다.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Jungle Tools (dev branch) │ Home / SG Manage / Dashboard │ [API Online] [User] [Disconnect] │
├──────────────────────────────────┼───────────────────────────────────────────┤
│ 🏠 Home                          │ [Main Content View]                       │
│ ┌──────────────────────────────┐ │                                           │
│ │ Target Account               │ │                                           │
│ │ [ Hub (l-iam-s2)          ▼] │ │                                           │
│ └──────────────────────────────┘ │                                           │
│                                  │                                           │
│ 🛡️ SG Manage                     │                                           │
│   ├ 📊 Dashboard                 │                                           │
│   └ 📜 Logs                      │                                           │
│                                  │                                           │
│ 💾 Backup Monitor                │                                           │
│   ├ 📈 Dashboard                 │                                           │
│   └ 🔔 Notification              │                                           │
│       ├ 💬 Slack                 │                                           │
│       │   ├ 🔗 웹훅              │                                           │
│       │   └ ✉️ Email             │                                           │
│       └ ✉️ Email                 │                                           │
│           ├ ⚙️ SMTP              │                                           │
│           └ 👥 주소 등록         │                                           │
│                                  │                                           │
│ ┌──────────────────────────────┐ │                                           │
│ │ 🔗 API: https://...          │ │                                           │
│ │ 🛡️ Role: JungleToolsRole    │ │                                           │
│ └──────────────────────────────┘ │                                           │
└──────────────────────────────────┴───────────────────────────────────────────┘
```

### 2.1 좌측 사이드바 (Left Sidebar)

1. **로고 영역 (Brand Header)**:
   - **앱 아이콘 & 타이틀**: `Jungle Tools` 브랜드 로고.
   - **브랜치 뱃지 (Dev Branch Badge)**: 개발 환경일 경우 황금색 뱃지로 현재 브랜치 및 커밋 해시(예: `develop@da31885`)를 출력합니다.
2. **홈 메뉴 (`#nav-home`)**:
   - 클릭 시 통합 인프라 및 보안 대시보드로 이동합니다.
3. **Target Account (프로필) 선택 카드 (`#target-account-select`)**:
   - **위치**: Home 메뉴 바로 아래 위치.
   - **기능**: 드롭다운 선택 시 관리 대상 AWS 계정(`Hub (l-iam-s2)`, `l-ellotte-dev`, `l-b2-dev` 등)을 즉시 전환합니다.
   - **동작**: 선택된 계정은 브라우저 `localStorage`에 자동 저장되며, 모든 API 요청 시 `X-Target-Role-Arn` 헤더를 통해 크로스 어카운트 AssumeRole이 수행됩니다.
4. **네비게이션 메뉴 그룹**:
   - **SG Manage 그룹**: `Dashboard`(보안 그룹 대시보드), `Logs`(감사 로그).
   - **Backup Monitor 그룹**: `Dashboard`(백업 관제 대시보드).
   - **Notification 중첩 메뉴**:
     - `Slack` 하위: `웹훅`(다중 웹훅 관리), `Email`(슬랙 채널 이메일).
     - `Email` 하위: `SMTP`(메일 서버 설정), `주소 등록`(수신자 목록 관리).
5. **사이드바 최하단 정보 패널 (Sidebar Footer)**:
   - **API Endpoint (`#api-endpoint-display`)**: 현재 연결된 API Gateway URL 출력.
   - **Role Name (`#target-role-display`)**: 크로스 어카운트 위임 역할 이름(`JungleToolsCrossAccountRole`) 출력.

---

### 2.2 상단 헤더 바 (Top Header Bar)

1. **브레드크럼 (Breadcrumb, `#breadcrumb-active` / `#breadcrumb-parent`)**:
   - 현재 화면의 메뉴 위치를 계층 구조로 명확히 표시합니다 (예: `Home`, `SG Manage / Dashboard`, `Backup Monitor / Notification / Slack / 웹훅`).
2. **API 연결 상태 뱃지 (`#api-status`)**:
   - **Online (녹색)**: 백엔드 API Gateway 및 인증 세션이 정상 연결됨.
   - **Connecting (노란색)**: 세션 검증 또는 데이터 통신 중.
   - **Session Expired (주황색)**: 8시간 세션이 만료되어 재인증이 필요함.
   - **Disconnected (회색/빨간색)**: 미인증 또는 연결 실패 상태.
3. **사용자 세션 정보 (`#session-info`)**:
   - **IAM User 텍스트 (`#session-user`)**: 현재 로그인된 IAM Role / User ID 표시.
   - **다시 로그인 버튼 (`#btn-relogin`)**: 세션 만료 시 즉시 로그인 팝업을 호출.
   - **Disconnect 버튼 (`#btn-logout`)**: 클릭 시 백엔드 세션을 파기하고 HttpOnly 쿠키를 초기화하며 로그아웃.

---

### 2.3 인증 및 로그인 모달 (Auth Modal)

브라우저에 유효한 세션 쿠키가 없거나 만료된 경우 화면 중앙에 표시되는 모달입니다.

- **API Endpoint URL (`#auth-api-endpoint`)**: API Gateway 엔드포인트 주소 (`config.js`에서 자동 로드).
- **AWS Access Key ID (`#auth-access-key`)**: 사용자 AWS IAM Access Key 입력 (예: `AKIA...` 또는 `ASIA...`).
- **AWS Secret Access Key (`#auth-secret-key`)**: 사용자 AWS Secret Access Key 입력 (마스킹 처리).
- **Session Token (`#auth-session-token`, 선택 사항)**: 임시 자격 증명(MFA / AssumeRole 등) 사용 시 필수 입력.
- **AWS Region (`#auth-region`)**: 기본 리전 선택 (`ap-northeast-2` 서울 등).
- **Sign In & Verify 버튼 (`#btn-login-submit`)**:
  - 클릭 시 백엔드 `POST /auth/login`을 호출하여 AWS STS `GetCallerIdentity`로 실제 자격 증명의 유효성을 실시간 검증합니다.
  - 검증 성공 시 `HttpOnly; Secure` 세션 쿠키를 수신하고 DOM 입력 필드의 민감 정보는 즉시 소거됩니다.

---

### 2.4 알림 및 토스트 메시지

- **토스트 알림 (`#toast-container`)**: 작업 성공(`success`), 경고(`warning`), 에러(`error`), 안내(`info`) 메시지가 우측 하단에 부드럽게 나타났다가 자동 소멸합니다.
- **세션 만료 모달 (`#modal-session-expired`)**: 장시간 미사용으로 8시간 TTL 세션이 만료된 경우 안내 메시지와 함께 재인증 버튼을 제공합니다.

---

## 3. 화면 및 메뉴별 상세 기능 설명

### 3.1 홈 대시보드 (Home)

Jungle Tools의 전체 인프라 현황을 한눈에 파악할 수 있는 메인 종합 대시보드입니다.

#### ① 요약 메트릭스 그리드 (Metrics Grid)
- **보안 그룹 총계**: 관리 대상 계정의 전체 VPC에 생성된 보안 그룹 수.
- **활성 인바운드 방화벽 규칙**: 현재 등록된 인바운드 보안 규칙의 총합.
- **활성 아웃바운드 방화벽 규칙**: 현재 등록된 아웃바운드 보안 규칙의 총합.
- **보호 중인 백업 리소스 수**: 정기 백업 스냅샷이 생성되어 있는 EBS, EFS, RDS 볼륨의 총합.
- **백업 규정 준수율 (Compliance %)**: 보호 리소스 대비 백업 성공률 백분율.

#### ② 퀵 네비게이션 바로가기 카드 (Quick Access Cards)
- **보안 그룹 대시보드 바로가기 (`#btn-home-goto-sg`)**: SG Manage 대시보드로 즉시 전환.
- **백업 관제 대시보드 바로가기 (`#btn-home-goto-backup`)**: Backup Monitor 대시보드로 즉시 전환.
- **Slack 알림 설정 바로가기 (`#btn-home-goto-slack`)**: Slack 웹훅 설정 페이지로 즉시 전환.
- **Email 수신자 관리 바로가기 (`#btn-home-goto-email`)**: 이메일 주소 등록 페이지로 즉시 전환.
- **보안 감사 로그 바로가기 (`#btn-home-goto-logs`)**: 감사 로그 조회 화면으로 즉시 전환.

#### ③ 멀티 계정 백업 상태 요약 테이블
- 연동된 모든 스포크 계정(l-ellotte-dev, l-b2-dev 등)의 EBS/EFS/RDS 보호 현황과 마지막 스캔 시각을 실시간 표시합니다.

---

### 3.2 보안 그룹 대시보드 (SG Manage > Dashboard)

VPC별 보안 그룹을 계층형으로 탐색하고, 인바운드/아웃바운드 방화벽 규칙을 추가, 수정, 삭제하는 화면입니다.

#### ① 상단 컨트롤 영역
- **새 보안 그룹 생성 버튼 (`#btn-open-create-sg`)**: 신규 SG 생성 팝업을 호출합니다.
- **새로고침 버튼 (`#btn-refresh-sgs`)**: AWS EC2 API를 다시 호출하여 최신 VPC 및 보안 그룹 목록을 갱신합니다.
- **보안 그룹 검색창 (`#sidebar-sg-search`)**: 보안 그룹 이름 또는 ID를 실시간으로 필터링합니다.

#### ② VPC 아코디언 목록 (`#vpc-list`)
- 계정에 존재하는 모든 VPC를 아코디언 형태로 나열합니다.
- 각 VPC를 클릭하면 해당 VPC에 소속된 보안 그룹 카드 목록이 펼쳐집니다.

#### ③ 보안 그룹 상세 뷰 패널 (`#view-sg-detail`)
특정 보안 그룹 카드를 선택했을 때 우측에 나타나는 상세 편집 화면입니다:
- **기본 정보**: Group Name, Group ID, Description, VPC ID 표시.
- **보안 그룹 삭제 버튼 (`#btn-delete-sg`)**: 선택한 보안 그룹을 삭제 (확인 팝업 후 수행).
- **규칙 탭 전환 (`#tab-inbound`, `#tab-outbound`)**:
  - 인바운드(Inbound) 및 아웃바운드(Outbound) 방화벽 룰 전환.
- **규칙 테이블**:
  - **Type**: HTTP(80), HTTPS(443), SSH(22), Custom TCP 등 프로토콜 유형 선택.
  - **Protocol**: TCP / UDP / ICMP / All Traffic.
  - **Port Range**: 단일 포트 또는 포트 범위(예: `8080`, `1000-2000`).
  - **Source / Destination**: CIDR 블록 (예: `0.0.0.0/0`, `10.0.0.0/16`) 또는 대상 보안 그룹 ID.
  - **Description**: 규칙별 설명 텍스트.
  - **행 삭제 버튼**: 개별 규칙 행 제거.
- **규칙 추가 버튼 (`#btn-add-inbound-rule`, `#btn-add-outbound-rule`)**: 새 규칙 행 추가.
- **규칙 저장 버튼 (`#btn-save-rules`)**: 편집된 모든 방화벽 규칙을 AWS EC2에 즉시 반영하고 감사 로그를 기록.
- **취소 버튼 (`#btn-cancel-rules`)**: 수정 사항을 버리고 원래 상태로 복원.

#### ④ 새 보안 그룹 생성 모달 (`#modal-create-sg`)
- **Group Name (`#create-sg-name`)**: 영문/숫자/하이픈 기반의 보안 그룹 이름.
- **Description (`#create-sg-desc`)**: 보안 그룹 용도 설명.
- **VPC Select (`#create-sg-vpc`)**: 소속될 VPC 드롭다운 선택.
- **Name Tag (`#create-sg-tag-name`)**: AWS 콘솔에 표시될 Name 태그 값.
- **생성 버튼 (`#btn-submit-create-sg`)**: AWS EC2 `CreateSecurityGroup` API 호출.

---

### 3.3 보안 그룹 감사 로그 (SG Manage > Logs)

보안 그룹의 생성(`CREATE`), 수정(`UPDATE`), 삭제(`DELETE`) 이력을 DynamoDB 및 **S3 Object Lock WORM 버킷**에서 조회하는 컴플라이언스 화면입니다.

#### ① WORM 보존 상태 뱃지
- **S3 Bucket Name**: 감사 로그 원본이 암호화되어 저장되는 전용 S3 버킷 명칭.
- **Object Lock 모드**: **`GOVERNANCE`** (또는 `COMPLIANCE`) 모드 및 보존 기간(30일) 표시.

#### ② 필터 및 검색
- **SG ID 검색창**: 특정 보안 그룹 ID(`sg-xxxx`)로 로그 필터링.
- **Action 필터**: 전체 / `CREATE` / `UPDATE` / `DELETE` 선택.
- **새로고침 버튼 (`#btn-refresh-logs`)**: 최신 감사 로그 목록 조회.

#### ③ 감사 로그 테이블 (`#table-body-logs`)
- **Timestamp**: 행위 발생 일시 (KST / UTC).
- **SG ID**: 대상 보안 그룹 ID.
- **Action**: 작업 유형 (`CREATE`, `UPDATE`, `DELETE`).
- **User Identity**: 작업을 수행한 IAM 사용자 ARN 또는 세션 식별자.
- **Status**: 작업 결과 (`SUCCESS`, `FAILED`).
- **WORM S3 Location**: S3 내 불변 객체 저장 경로 (`s3://.../year=.../month=.../....json`).
- **상세보기 버튼**: 클릭 시 JSON 상세 모달을 호출.

#### ④ 로그 상세 JSON 모달 (`#modal-log-detail`)
- 감사 로그의 전체 JSON 페이로드(이전/이후 방화벽 규칙 변경 내역, IP 차이점, 클라이언트 정보 등)를 포맷팅된 코드로 확인 가능.

---

### 3.4 백업 관제 대시보드 (Backup Monitor > Dashboard)

멀티 계정의 AWS 백업 대상 자원(EBS 볼륨, EFS 파일 시스템, RDS 인스턴스)의 스냅샷 생성 현황과 보호 상태를 통합 관제하는 화면입니다.

#### ① 서비스별 백업 요약 카드
- **EBS Volumes & Snapshots**: 총 EBS 볼륨 수 대비 최근 24시간 내 생성된 스냅샷 보유 볼륨 비율.
- **EFS File Systems**: 전체 EFS 파일 시스템 및 복구 시점(Recovery Point) 현황.
- **RDS Databases**: 전체 RDS DB 인스턴스 및 자동/수동 DB 스냅샷 보유 현황.
- **Overall Backup Health**: 전체 리소스 백업 상태를 시각적 게이지 및 컬러 상태(녹색: 안전, 빨간색: 미보호)로 표시.

#### ② 서비스별 서브 탭 (`#tab-backup-ebs`, `#tab-backup-efs`, `#tab-backup-rds`)
- 각 탭을 클릭하여 해당 AWS 서비스의 상세 인벤토리 테이블을 확인합니다:
  - **Volume/Instance ID**: 리소스 식별자.
  - **Name Tag**: 리소스 이름 태그.
  - **Size / Engine**: 볼륨 용량(GB) 또는 DB 엔진/인스턴스 타입.
  - **Last Snapshot Time**: 가장 최근 생성된 스냅샷 일시.
  - **Protection Status**: 보호됨 (`PROTECTED`, 녹색 뱃지) / 미보호 (`UNPROTECTED`, 빨간색 뱃지).

---

### 3.5 Slack 웹훅 설정 (Backup Monitor > Notification > Slack > 웹훅)

다양한 Slack 채널 및 워크스페이스로 백업 관제 일일 리포트를 전송하기 위해 **다중 Slack Webhook**을 관리하는 화면입니다.

#### ① 다중 웹훅 목록 카드 그리드 (`#webhooks-container`)
- 등록된 모든 Slack 웹훅 카드를 나열합니다.
- 각 카드 정보:
  - **웹훅 이름**: 채널 또는 목적 식별 명칭 (예: `DevOps 팀 알림`, `보안 모니터링 채널`).
  - **웹훅 URL**: 마스킹 처리된 `hooks.slack.com` 주소.
  - **메시지 유형**: 간이형(Simple) 또는 상세형(Detailed Table).
  - **스케줄 정보**: 매시간, 매일 오전 9시, 또는 Custom Cron.
  - **활성화 토글**: 해당 웹훅의 알림 발송 on/off.
  - **단일 테스트 발송 버튼**: 해당 채널로 즉시 테스트 메시지 전송.
  - **수정 / 삭제 버튼**: 웹훅 설정 변경 또는 제거.

#### ② 상단 컨트롤 버튼
- **웹훅 추가 버튼 (`#btn-open-add-webhook`)**: 신규 웹훅 등록 모달 호출.
- **전체 웹훅 일괄 테스트 버튼 (`#btn-test-all-webhooks`)**: 활성화된 모든 Slack 웹훅으로 동시에 테스트 알림 발송.

#### ③ 웹훅 등록/수정 모달 (`#modal-webhook`)
- **Webhook Name (`#webhook-modal-name`)**: 웹훅 별칭 입력.
- **Webhook URL (`#webhook-modal-url`)**: 
  - `https://hooks.slack.com/services/...`, `/workflows/...`, `/triggers/...` 형식만 허용 (SSRF 방어 정규식 자동 검증).
- **Message Type (`#webhook-modal-msgtype`)**:
  - `detailed`: Block Kit 기반의 리치 차트, 테이블, 요약 통계 리포트.
  - `simple`: 텍스트 위주의 컴팩트 요약 알림.
- **Schedule (`#webhook-modal-schedule`)**:
  - `hourly`: 매시간 정각 (`0 * * * ? *`)
  - `daily_9am`: 매일 오전 9시 KST (`0 0 * * ? *`)
  - `custom`: 사용자 정의 Cron 표현식 입력 필드 제공.
- **저장 버튼 (`#btn-save-webhook-modal`)**: DynamoDB `SlackConfig` 테이블에 안전하게 저장.

---

### 3.6 Slack Email 설정 (Backup Monitor > Notification > Slack > Email)

Slack 채널 고유의 이메일 주소(예: `channel-xxxx@workspace.slack.com`)를 통해 백업 리포트를 Slack으로 전달하는 기능입니다.

- **Slack Email 알림 활성화 토글 (`#slack-enabled-toggle`)**: 이메일 기반 알림 활성화 여부.
- **Channel Email Address (`#slack-channel-email`)**: Slack 채널의 이메일 통합 주소 입력 (RFC 5322 규격 검증).
- **발송 포맷 (`#slack-email-msgtype`)**: 간이형 / 상세형 선택.
- **발송 스케줄 (`#slack-schedule-cron`)**: Cron 표현식 설정.
- **설정 저장 (`#btn-save-slack`) & 테스트 발송 (`#btn-test-slack`)**: 즉시 전송 테스트.

---

### 3.7 SMTP 서버 설정 (Backup Monitor > Notification > Email > SMTP)

회사 사내 메일 서버 또는 외부 SMTP 서버를 통해 알림 이메일을 발송할 때 사용하는 설정 화면입니다.

- **SMTP Host (`#smtp-host`)**: 메일 서버 호스트명 (예: `smtp.mailgun.org`, `email-smtp.ap-northeast-2.amazonaws.com`).
- **SMTP Port (`#smtp-port`)**: 포트 번호 (`587` TLS, `465` SSL, `25`).
- **Secure Toggle (`#smtp-secure`)**: SSL/TLS 보안 연결 사용 여부.
- **Username (`#smtp-user`)**: SMTP 계정 아이디 또는 SES SMTP 사용자.
- **Password (`#smtp-pass`)**: SMTP 비밀번호 (마스킹).
- **From Address (`#smtp-from`)**: 발신자 이메일 주소 (예: `no-reply@jungletools.io`).
- **설정 저장 및 연결 테스트 버튼**: SMTP 핸드셰이크 및 인증 테스트 수행.

---

### 3.8 이메일 주소 등록 (Backup Monitor > Notification > Email > 주소 등록)

일일 백업 종합 리포트를 수신할 담당자들의 이메일 주소 목록을 관리하는 화면입니다.

- **수신자 목록 텍스트 영역 (`#email-recipients-input`)**:
  - 쉼표(`,`), 세미콜론(`;`), 또는 줄바꿈(Enter)으로 구분된 다중 이메일 입력.
  - 예시:
    ```text
    admin@company.com, devops-lead@company.com
    cloud-sec@company.com; oncall@company.com
    ```
  - 저장 시 **RFC 5322 표준 이메일 유효성 검증**이 자동 수행되어 잘못된 주소가 차단됩니다.
- **수신자 목록 저장 버튼 (`#btn-save-recipients`)**: DynamoDB에 수신자 목록 갱신.
- **일일 리포트 미리보기 버튼 (`#btn-preview-email-report`)**:
  - 현재 시점의 전체 계정 EBS/EFS/RDS 백업 상태를 집계하여 실제 발송될 HTML 이메일 리포트를 화면에 렌더링.
- **리포트 즉시 발송 버튼 (`#btn-send-email-now`)**:
  - 등록된 모든 수신자에게 백업 현황 종합 리포트 즉시 발송.

---

## 4. 주요 운영 시나리오 가이드

### 시나리오 1: 첫 접속 및 로그인
1. 웹 브라우저에서 Jungle Tools 콘솔 URL로 접속합니다.
2. 로그인 모달에 AWS 자격 증명(Access Key ID, Secret Access Key, Session Token)을 입력합니다.
3. `Sign In & Verify`를 클릭하면 STS 자격 증명 검증 후 `HttpOnly` 세션 쿠키가 발급되며 자동으로 메인 화면으로 진입합니다.

### 시나리오 2: 타겟 AWS 계정 전환
1. 좌측 사이드바의 `Home` 바로 아래에 있는 **Target Account 드롭다운**을 클릭합니다.
2. 전환하고자 하는 스포크 계정(예: `l-ellotte-dev`)을 선택합니다.
3. 선택 즉시 모든 대시보드(보안 그룹, 백업 관제 등)가 해당 계정의 리소스를 로드하도록 자동 갱신됩니다.

### 시나리오 3: 신규 보안 그룹 생성 및 인바운드 방화벽 규칙 등록
1. 사이드바에서 `SG Manage > Dashboard`를 클릭합니다.
2. 상단의 `+ New Security Group` 버튼을 클릭합니다.
3. 보안 그룹 이름, 설명, 소속 VPC를 선택하고 `Create`를 누릅니다.
4. 생성된 보안 그룹 카드를 클릭하여 우측 상세 패널을 엽니다.
5. `+ Add Rule` 버튼을 눌러 원하는 프로토콜(예: HTTPS 443)과 Source CIDR(`0.0.0.0/0`)을 입력합니다.
6. `Save Changes` 버튼을 클릭하여 EC2에 적용합니다.

### 시나리오 4: 감사 로그 및 WORM S3 보존 상태 확인
1. 사이드바에서 `SG Manage > Logs`를 클릭합니다.
2. 방금 생성/수정한 보안 그룹의 `CREATE` 또는 `UPDATE` 로그 행을 확인합니다.
3. `View Details`를 클릭하여 세부 변경 내용과 S3 WORM 객체 경로(`s3://...`)를 확인합니다.

### 시나리오 5: Slack 일일 백업 리포트 자동화 구성
1. 사이드바에서 `Backup Monitor > Notification > Slack > 웹훅`을 클릭합니다.
2. `+ Add Webhook`을 클릭합니다.
3. Slack 채널에서 발급받은 Incoming Webhook URL을 입력하고, 포맷을 `detailed`, 스케줄을 `daily_9am`으로 선택합니다.
4. `Save Webhook`을 누르고 `Test` 버튼을 눌러 슬랙 채널에 리포트가 정상 수신되는지 확인합니다.

---

## 5. 자주 묻는 질문 및 문제 해결 (FAQ & Troubleshooting)

#### Q1. 로그인할 때 "Failed to fetch" 오류가 발생합니다.
- **원인**: 브라우저의 CORS 설정 또는 네트워크 문제일 수 있습니다.
- **해결책**:
  - 프론트엔드가 접근하는 API Gateway의 CORS 정책에 `Access-Control-Allow-Credentials: true`가 활성화되어 있고 해당 도메인이 등록되어 있어야 합니다 (이미 최신 배포에 적용 완료).
  - 브라우저를 강력 새로고침(`Ctrl + F5` 또는 `Cmd + Shift + R`)하여 최신 자바스크립트 캐시를 갱신하세요.

#### Q2. 8시간 후 화면을 조작하니 "세션이 만료되었습니다" 알림이 뜹니다.
- **원인**: 보안 강화를 위해 세션 쿠키는 8시간 TTL로 자동 만료됩니다.
- **해결책**: 상단 바의 `다시 로그인` 버튼 또는 팝업 모달에서 자격 증명을 다시 입력하시면 작업 상태를 유지한 채 세션이 갱신됩니다.

#### Q3. 스포크 계정의 보안 그룹 목록을 조회할 수 없습니다.
- **원인**: 해당 스포크 계정에 `JungleToolsCrossAccountRole` IAM 역할이 생성되지 않았거나 AssumeRole 신뢰 관계(Trust Relationship)가 허브 계정을 허용하지 않은 경우입니다.
- **해결책**: 해당 스포크 계정에서 `./scripts/setup-all-spokes.sh`를 실행하거나 `spoke-account-template.yaml` CloudFormation 템플릿을 배포해 주세요.

#### Q4. Slack 웹훅 등록 시 "유효하지 않은 슬랙 웹훅 URL입니다" 에러가 발생합니다.
- **원인**: 피싱 및 SSRF 방어를 위해 `https://hooks.slack.com/services/...`, `/workflows/...`, `/triggers/...` 형식의 공식 URL만 등록 가능합니다.
- **해결책**: Slack 앱 관리자 콘솔에서 생성된 공식 Webhook URL 전체를 올바르게 복사하여 입력해 주세요.

---

*본 문서는 Jungle Tools v1.0.0 버전을 기준으로 작성되었으며 최신 업데이트 내역을 상시 반영합니다.*
