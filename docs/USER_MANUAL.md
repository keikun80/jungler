# Jungle Tools 종합 사용자 매뉴얼 (User Manual) & 기능 사용 가이드

Jungle Tools는 멀티 계정 AWS 클라우드 환경에서 **VPC 보안 그룹(Security Group) 라이프사이클 관리 및 연관 리소스 심층 인스펙션**, **WORM S3 Object Lock 규정 준수 감사 로깅**, **멀티 서비스(EBS, EFS, RDS) 백업 통합 관제**, **고아 스냅샷 및 미사용 AMI 비용 최적화**, 그리고 **Slack/Email 지능형 알림 자동화**를 제공하는 엔터프라이즈급 클라우드 관리 콘솔입니다.

---

## 목차 (Table of Contents)

1. [시스템 아키텍처 및 BFF 세션 보안](#1-시스템-아키텍처-및-bff-세션-보안)
2. [공통 레이아웃 및 글로벌 UI 요소](#2-공통-레이아웃-및-글로벌-ui-요소)
   - [2.1 좌측 사이드바 (Left Sidebar)](#21-좌측-사이드바-left-sidebar)
   - [2.2 대상 AWS 계정 전환 (Target Account Selector)](#22-대상-aws-계정-전환-target-account-selector)
   - [2.3 상단 헤더 바 (Top Header Bar)](#23-상단-헤더-바-top-header-bar)
   - [2.4 로그인 및 세션 관리 (Auth Modal)](#24-로그인-및-세션-관리-auth-modal)
3. [메뉴별 화면 구성 및 상세 사용법 (Step-by-Step)](#3-메뉴별-화면-구성-및-상세-사용법-step-by-step)
   - [3.1 홈 대시보드 (Home)](#31-홈-대시보드-home)
   - [3.2 보안 그룹 및 방화벽 관리 (SG Manage > Dashboard)](#32-보안-그룹-및-방화벽-관리-sg-manage--dashboard)
     - [3.2.1 보안 그룹 연관 리소스(Connected Resources) 심층 분석 및 사전 영향도 평가](#321-보안-그룹-연관-리소스connected-resources-심층-분석-및-사전-영향도-평가)
     - [3.2.2 타 보안 그룹 교차 참조(Referenced Rules) 및 고아(Orphan) 보안 그룹 판별](#322-타-보안-그룹-교차-참조referenced-rules-및-고아orphan-보안-그룹-판별)
     - [3.2.3 인스펙션 실행 로그(Inspection Execution Logs) 및 트러블슈팅 팁](#323-인스펙션-실행-로그inspection-execution-logs-및-트러블슈팅-팁)
   - [3.3 보안 감사 로그 및 WORM 스토리지 (SG Manage > Logs)](#33-보안-감사-로그-및-worm-스토리지-sg-manage--logs)
   - [3.4 멀티 서비스 백업 관제 (Backup Monitor > Dashboard)](#34-멀티-서비스-백업-관제-backup-monitor--dashboard)
   - [3.5 스냅샷 및 AMI 추적기 (Snapshot & AMI Tracer)](#35-스냅샷-및-ami-추적기-snapshot--ami-tracer)
   - [3.6 Slack 멀티 웹훅 알림 설정 (Notification > Slack > 웹훅)](#36-slack-멀티-웹훅-알림-설정-notification--slack--웹훅)
   - [3.7 이메일 주소 등록 및 일일 백업 리포트 (Notification > Email)](#37-이메일-주소-등록-및-일일-백업-리포트-notification--email)
4. [운영 FAQ 및 트러블슈팅](#4-운영-faq-및-트러블슈팅)

---

## 1. 시스템 아키텍처 및 BFF 세션 보안

Jungle Tools는 안전하고 확장성 높은 서버리스 및 **BFF(Backend-for-Frontend) 패턴**으로 구축되었습니다.

```
[사용자 브라우저]
  │  ▲
  │  │ (1) STS GetCallerIdentity 인증 및 8시간 세션 쿠키 발급
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
  │      ├─► 허브/스포크 계정 AssumeRole (JungleToolsCrossAccountRole)
  │      ├─► EC2 보안 그룹 및 인바운드/아웃바운드 방화벽 제어
  │      ├─► [신규] 보안 그룹 연관 리소스(ENI, EC2, RDS, ELB, Lambda) 역추적
  │      ├─► EBS / EFS / RDS 백업 현황 실시간 스캔
  │      ├─► 고아 스냅샷 및 비정상 AMI 비용 최적화 추적
  │      └─► Slack Incoming Webhook / SES Email 자동 발송
  │
  └──► [데이터 저장소]
         ├─► DynamoDB: 실시간 세션, 감사 로그, 알림 설정
         └─► S3 Bucket (Object Lock WORM): 30일간 변조 불가 감사 로그 보존
```

---

## 2. 공통 레이아웃 및 글로벌 UI 요소

### 2.1 좌측 사이드바 (Left Sidebar)
- **브랜드 로고 (`#app-logo-title`)**: Jungle Tools 로고 및 현재 Git 브랜치(`develop`) 표시
- **Home 메뉴 (`#nav-home`)**: 최상단 인프라 통합 대시보드로 즉시 이동
- **Target Account 셀렉터 (`#target-account-select`)**: 관리 대상 AWS 계정 즉시 전환
- **SG Manage 메뉴군**: 방화벽 관리 대시보드 및 감사 로그
- **Backup Monitor 메뉴군**: 백업 관제 대시보드, 스냅샷 추적기, AMI 추적기, 알림 설정
- **사이드바 푸터**: 현재 연결된 백엔드 `API Endpoint` 및 위임 `Role Name` (`JungleToolsCrossAccountRole`) 표시

### 2.2 대상 AWS 계정 전환 (Target Account Selector)
![Target Account Selector](images/screen_home.jpg)

**[사용법 Step-by-Step]**
1. **1단계**: 좌측 사이드바 상단의 `Target Account` 드롭다운 클릭
2. **2단계**: 관리하고자 하는 AWS 계정 선택 (`Hub (l-iam-s2)`, `l-ellotte-dev`, `l-b2-dev`, `l-cicd-s2` 등)
3. **3단계**: 시스템이 STS AssumeRole을 통해 해당 계정의 보안 그룹 및 백업 리소스를 즉시 불러옴

### 2.3 상단 헤더 바 (Top Header Bar)
- **Breadcrumb (`#breadcrumb-active`)**: 현재 화면의 위치 경로 표시 (예: `SG Manage / Dashboard`)
- **API Status Badge (`#api-status`)**: 백엔드 연결 상태 (`Online` 녹색 / `Expired` 황색 / `Disconnected` 적색)
- **User Profile Display (`#header-user-display`)**: 현재 로그인된 관리자 식별자 표시
- **로그아웃 버튼 (`#btn-logout`)**: 클릭 시 BFF 세션을 안전하게 종료하고 로그인 창으로 전환

### 2.4 로그인 및 세션 관리 (Auth Modal)
![Jungle Tools 로그인 화면](images/screen_login.jpg)

**[사용법 Step-by-Step]**
1. **1단계**: Jungle Tools 웹 콘솔 접속 시 미인가 상태이면 `#modal-login` 로그인 창이 중앙에 표시됩니다.
2. **2단계**: 관리자 ID와 비밀번호를 입력합니다.
3. **3단계**: `Sign In` 버튼을 클릭합니다. 인증 성공 시 8시간 유효한 `HttpOnly` 세션 쿠키가 발급되며 `Online` 상태로 진입합니다.
4. **4단계**: 작업 완료 후 상단 `Disconnect` 버튼을 눌러 안전하게 로그아웃합니다.

---

## 3. 메뉴별 화면 구성 및 상세 사용법 (Step-by-Step)

### 3.1 홈 대시보드 (Home)
![Jungle Tools Home 대시보드](images/screen_home.jpg)

계정 내 인프라 보안 그룹 및 백업 현황을 한눈에 파악하는 통합 대시보드입니다.

#### 주요 UI 요소
- **`#btn-refresh-home`**: 전체 VPC 보안 그룹 및 백업 리소스 실시간 재집계
- **SG Manage 요약 카드**: Active VPCs, Total Security Groups, Inbound Rules 지표
- **Backup Monitor 요약 카드**: Total Resources, Healthy (<=7d), Failure/Warning, Unprotected 지표
- **Quick Action 바로가기 배너**: 보안 그룹 관리, 백업 관제, 감사 로그, Slack 웹훅, Email 주소 등록 바로가기

---

### 3.2 보안 그룹 및 방화벽 관리 (SG Manage > Dashboard)
![Jungle Tools SG Manage 대시보드](images/screen_sg_dashboard.jpg)

VPC별 아코디언 목록을 확인하고, 신규 보안 그룹 생성 및 인바운드/아웃바운드 방화벽 규칙을 웹에서 직관적으로 편집합니다.

#### 주요 UI 요소
- **`#btn-open-create-sg`**: 신규 보안 그룹 생성 모달 (`#modal-create-sg`) 호출
- **`#sidebar-sg-search`**: 보안 그룹 이름 또는 ID 실시간 검색창
- **`#vpc-list`**: VPC별 보안 그룹 아코디언 트리
- **`#tab-inbound` / `#tab-outbound` / `#tab-resources`**: 인바운드 / 아웃바운드 / **연관 리소스** 탭 전환
- **`#btn-add-inbound-rule` / `#btn-add-outbound-rule`**: 새 방화벽 규칙 행 추가 버튼
- **`#btn-save-rules`**: 편집된 규칙을 AWS EC2에 즉시 일괄 적용하는 저장 버튼
- **`#btn-delete-sg`**: 선택된 보안 그룹 안전 삭제 버튼 (연관 리소스 점검 권장)

#### [사용법 Step-by-Step]
1. **신규 보안 그룹 생성**:
   - 1. 우측 상단 `+ New Security Group` 버튼을 클릭합니다.
   - 2. 모달 창에서 대상 **VPC**를 선택하고, **Group Name** 및 **Description**을 입력합니다.
   - 3. `Create Security Group` 버튼을 클릭하여 생성합니다.
2. **방화벽 인바운드/아웃바운드 규칙 편집**:
   - 1. 좌측 VPC 트리에서 편집할 보안 그룹을 선택합니다.
   - 2. `Inbound Rules` 또는 `Outbound Rules` 탭을 클릭합니다.
   - 3. `+ Add Rule` 버튼을 눌러 Type(HTTP, HTTPS, SSH, Custom TCP 등), Port Range, Source CIDR(예: `10.0.0.0/16`), Description을 입력합니다.
   - 4. 우측 하단 `Save & Apply Rules` 버튼을 클릭하여 즉시 AWS EC2 방화벽에 적용합니다.

![Jungle Tools 보안 그룹 인/아웃바운드 방화벽 규칙 편집](images/screen_sg_detail.jpg)

---

#### 3.2.1 보안 그룹 연관 리소스(Connected Resources) 심층 분석 및 사전 영향도 평가

> **"방화벽 규칙 변경이나 보안 그룹 삭제 전, 실제 어떤 서비스가 이 보안 그룹에 묶여 있는지 1초 만에 확인!"**

![Jungle Tools 보안 그룹 연관 리소스 분석 (Connected Resources)](images/screen_sg_resources.jpg)

보안 그룹 상세 화면(`view-sg-detail`)의 세 번째 탭인 **`Connected Resources`**는 해당 보안 그룹에 연결된 모든 AWS 인프라 리소스를 실시간 역추적(Reverse Inspection)하여 테이블로 시각화합니다.

```
[보안 그룹 상세 화면]
  ├─ Inbound Rules (12)
  ├─ Outbound Rules (4)
  └─ Connected Resources (5) ◄── 클릭!
        │
        ├─ 1. Attached AWS Resources Table (EC2, ALB, NLB, RDS, Lambda, ENI)
        ├─ 2. Cross-SG Referencing Rules Table (타 보안 그룹의 인/아웃바운드 참조 룰)
        └─ 3. Inspection Execution Logs & Trace (실시간 터미널 로그 및 에러 진단 팁)
```

##### 1) 리소스 분류 및 표시 항목
| 리소스 유형 | 아이콘 | 표시 명칭 | 세부 속성 및 설명 |
| :--- | :---: | :--- | :--- |
| **EC2 Instance** | 🖥️ `server` | 인스턴스 Name 태그 (없을 시 ID) | 인스턴스 ID, 가동 상태(`running`), 인스턴스 타입(`t3.medium`), 사설 IP, 서브넷 ID |
| **ALB (Application Load Balancer)** | 🌐 `network` | 로드밸런서 이름 | `ELB app/my-prod-alb/...` 분석 기반 로드밸런서 명칭, 사설 IP, 서브넷 ID |
| **NLB (Network Load Balancer)** | 🌐 `network` | 네트워크 로드밸런서 이름 | `ELB net/my-prod-nlb/...` 분석 기반 로드밸런서 명칭, 사설 IP, 서브넷 ID |
| **RDS / Aurora Database** | 🗄️ `database` | RDS DB 인스턴스/클러스터 명 | RDS 전용 인터페이스(`RDSNetworkInterface`), 사설 IP, 서브넷 ID |
| **AWS Lambda (VPC)** | ⚡ `zap` | Lambda VPC Interface | VPC 서브넷에 연결된 Lambda 함수의 ENI 식별자 및 IP |
| **VPC Endpoint (PrivateLink)** | 🔌 `plug` | `vpce-xxxx` | AWS 서비스 프라이빗 링크 엔드포인트 ID |
| **NAT Gateway** | ↗️ `arrow-up-right` | `nat-xxxx` | 아웃바운드 인터넷 게이트웨이 인터페이스 ID |
| **기타 ENI** | 🧩 `cpu` | 네트워크 인터페이스 ID | 미분류 사용자 정의 네트워크 인터페이스 |

---

#### 3.2.2 타 보안 그룹 교차 참조(Referenced Rules) 및 고아(Orphan) 보안 그룹 판별

1. **타 보안 그룹 교차 참조 감지 (`Referenced by Other Security Group Rules`)**:
   - 본 보안 그룹을 허용 소스(`Source`)나 목적지(`Destination`)로 참조하고 있는 **상위 보안 그룹의 방화벽 규칙**이 존재할 경우 자동으로 감지하여 별도 테이블로 출력합니다.
   - *주의*: 이 보안 그룹을 임의로 삭제하거나 룰을 변경하면, 참조하고 있던 상위 서비스와의 통신이 중단될 수 있습니다.
2. **미사용 고아 보안 그룹 감지 (`Orphaned / Unused SG`)**:
   - 연결된 ENI 리소스가 0개이고, 타 보안 그룹의 참조 규칙도 0건일 경우:
   - 상단에 **`Unused (Safe to Delete)`** 녹색 뱃지가 부여되며,
   - 본문에 **"No Connected Resources (Orphaned / Unused SG)"** 안전 삭제 안내 카드가 노출됩니다.
   - 불필요한 고아 보안 그룹을 안심하고 정리할 수 있습니다.

---

#### 3.2.3 인스펙션 실행 로그(Inspection Execution Logs) 및 트러블슈팅 팁

하단의 **`Inspection Execution Logs & Trace`** 패널은 AWS API 호출 과정을 실시간 스트리밍으로 제공합니다:

1. **터미널 로그 스트리밍 (`terminal-log-output`)**:
   - `[2026-10-15T...] [INFO] Initiating inspection for Security Group: sg-xxxx`
   - `[2026-10-15T...] [INFO] Found 3 Network Interface(s) attached`
   - `[2026-10-15T...] [INFO] Querying EC2 instance metadata for 2 instance(s)`
   - `[2026-10-15T...] [INFO] Checking cross-group references...`
2. **지능형 에러 진단 박스 (`inspection-error-box`)**:
   - Spoke 계정에 권한이 부족하여 조회가 차단된 경우, 단순 실패에 그치지 않고 구체적인 원인과 해결 팁을 제시합니다:
   - **원인 설명**: `Target IAM role is missing permission 'ec2:DescribeNetworkInterfaces'`
   - **해결 팁 (Tip)**: `Spoke 계정 IAM 역할에 DescribeNetworkInterfaces 권한을 추가하거나, ./scripts/setup-all-spokes.sh 를 실행하여 일괄 업데이트하세요.`

---

### 3.3 보안 감사 로그 및 WORM 스토리지 (SG Manage > Logs)
![Jungle Tools SG Logs 감사 로그](images/screen_sg_logs.jpg)

모든 보안 그룹 변경 이력(`CREATE`, `UPDATE`, `DELETE`)을 조회하며, 규정 준수를 위한 **S3 Object Lock (30일 보존)** 스토리지 위치를 확인합니다.

#### 주요 UI 요소
- **`#log-s3-bucket-name`**: 감사 원본 파일이 암호화 보관되는 WORM S3 버킷 명칭
- **Object Lock Compliance 뱃지**: `GOVERNANCE Mode (30 Days)` 무결성 보증 뱃지
- **`#btn-refresh-logs`**: 감사 로그 실시간 새로고침 버튼
- **`#modal-log-detail`**: 변경 전/후 JSON Diff 및 S3 Object URI 상세 열람 모달

---

### 3.4 멀티 서비스 백업 관제 (Backup Monitor > Dashboard)
![Jungle Tools 백업 관제 대시보드](images/screen_backup.jpg)

EBS 볼륨, EFS 파일 시스템, RDS 데이터베이스의 일일 백업 및 자동 보호 정책 준수 여부를 통합 감시합니다.

#### 주요 UI 요소
- **백업 요약 지표 카드**: EBS Volumes, EFS File Systems, RDS Databases의 보호 현황 및 헬스 지표
- **`#tab-backup-ebs`**: EBS 볼륨별 연결 인스턴스, 최근 스냅샷 시간, 보호 상태 테이블
- **`#tab-backup-efs`**: EFS 파일 시스템별 자동 백업 정책 및 복구 시점 테이블
- **`#tab-backup-rds`**: RDS 데이터베이스별 스냅샷 생성 현황 및 백업 주기 점검 테이블

---

### 3.5 스냅샷 및 AMI 추적기 (Snapshot & AMI Tracer)

#### 1) EBS Snapshot Tracer (`Backup Monitor > Snapshot Tracer`)
![Jungle Tools Snapshot Tracer (EBS 고아 스냅샷 탐색)](images/screen_backup_snapshot_tracer.jpg)

- 연결된 볼륨이 삭제된 고아 스냅샷(`Orphaned`)을 식별하여 불필요한 스토리지 과금을 즉시 차단합니다.
- 스냅샷 용량 및 월간 추정 비용(`$0.05/GiB-mo`), 원본 볼륨 부착 상태, AMI 이미지 사용 여부를 실시간 매핑합니다.

#### 2) AMI Lifecycle Tracer (`Backup Monitor > AMI Tracer`)
![Jungle Tools AMI Lifecycle Tracer (미사용 AMI 및 비용 절감 탐색)](images/screen_backup_ami_tracer.jpg)

- 인스턴스 및 시작 템플릿(Launch Template)에서 전혀 참조되지 않는 노후 AMI를 탐색합니다.
- Deregister 시 매월 절감 가능한 예상 스토리지 비용(`-$xx.xx/월`)을 계산하며, 연계 EBS 스냅샷까지 일괄 안전 정리(Clean Deregister)합니다.

---

### 3.6 Slack 알림 연동 (Notification > Slack)

#### 1) Slack 다중 웹훅 관리 (웹훅)
![Jungle Tools Slack 웹훅 설정](images/screen_slack_webhook.jpg)

여러 운영 Slack 채널로 일일 백업 리포트 및 보안 변경 알림을 자동 전송하기 위해 다중 Webhook을 등록하고 관리합니다.

##### [사용법 Step-by-Step]
1. **1단계**: 좌측 메뉴에서 `Notification > Slack > 웹훅`으로 이동합니다.
2. **2단계**: `+ 새 웹훅 추가` 버튼을 클릭하여 웹훅 이름, Slack Incoming Webhook URL, 메시지 포맷(`summary`, `report`, `preview`, `full`)을 입력하고 저장합니다.
3. **3단계**: 등록된 웹훅의 `Test` 버튼을 눌러 슬랙 채널로 메시지가 정상 도달하는지 확인합니다.
4. **4단계**: `전체 활성 웹훅 테스트` 버튼을 눌러 전체 운영 채널의 통신 상태를 일괄 검증합니다.

#### 2) Slack 채널 이메일 관리 (Email)
![Jungle Tools Slack 채널 이메일 연동](images/screen_slack_email.jpg)

Slack 채널 고유 수신 이메일 주소를 등록하고, EventBridge 일일 자동 스케줄(매일 09:00 KST)에 따라 일일 백업 보고서가 자동 발송되도록 구성합니다.

---

### 3.7 이메일 연동 및 일일 백업 리포트 (Notification > Email)

#### 1) 이메일 주소 등록 및 보고서 수신 (주소 등록)
![Jungle Tools 이메일 수신자 등록 및 리포트](images/screen_email.jpg)

정기 일일 백업 요약 보고서를 수신할 담당자 이메일을 등록하고, 완성된 HTML 이메일 보고서를 미리보기 및 즉시 발송합니다.

##### [사용법 Step-by-Step]
1. **1단계**: 좌측 메뉴에서 `Notification > Email > 주소 등록`으로 이동합니다.
2. **2단계**: 입력란에 수신할 담당자 이메일 주소들을 입력하고 `Save Recipients`를 클릭합니다.
3. **3단계**: `Preview Report` 버튼을 눌러 발송될 메일 레이아웃을 확인합니다.
4. **4단계**: `Send Test Report Now` 버튼을 클릭하여 즉시 보고서를 일괄 발송합니다.

#### 2) SMTP 서버 설정 (SMTP)
![Jungle Tools Email SMTP 서버 설정](images/screen_email_smtp.jpg)

사내 메일 서버 또는 AWS SES SMTP 엔드포인트 연동 정보를 설정하고 실시간 연결 테스트를 수행합니다.

---

## 4. 운영 FAQ 및 트러블슈팅

### Q1. 로그인 시 "Failed to fetch" 오류가 발생합니다.
> **원인 및 조치**: 브라우저에 이전 정적 캐시가 남아있을 수 있습니다. `Ctrl + F5` (Mac: `Cmd + Shift + R`)를 눌러 브라우저 캐시를 강력 새로고침한 뒤 다시 접속하세요.

### Q2. 8시간 후 작업 시 "세션이 만료되었습니다" 알림이 나타납니다.
> **원인 및 조치**: BFF 보안 정책상 발급된 HttpOnly 세션은 8시간 TTL을 가집니다. 상단 헤더의 `Re-login` 버튼을 클릭하여 자격 증명을 입력하면 작업 상태를 유지한 채 세션이 갱신됩니다.

### Q3. 특정 스포크 계정(예: l-ellotte-dev) 선택 시 리소스 조회가 실패합니다.
> **원인 및 조치**: 대상 스포크 계정에 `JungleToolsCrossAccountRole` IAM 역할이 생성되어 있지 않거나 신뢰 관계에 허브 계정 ID가 누락된 경우입니다. 스포크 계정에서 CloudFormation 템플릿(`spoke-account-template.yaml`)을 배포하면 즉시 해결됩니다.

### Q4. [신규] 보안 그룹 연관 리소스 조회 시 "Missing ec2:DescribeNetworkInterfaces" 오류가 발생합니다.
> **원인 및 조치**: 신규 추가된 연관 리소스 인스펙터 기능은 Spoke 계정의 ENI 및 EC2 인스턴스 메타데이터를 조회합니다. 이전 버전의 Spoke 템플릿으로 배포된 경우 권한이 누락되어 있을 수 있습니다.
> 1. 해당 Spoke 계정에서 최신 `spoke-account-template.yaml`을 CloudFormation으로 업데이트 배포하거나,
> 2. 터미널에서 `./scripts/setup-all-spokes.sh`를 실행하여 9개 전체 Spoke 계정의 IAM 권한을 한 번에 자동 최신화하세요.
