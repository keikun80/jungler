# Jungle Tools 전체 기능 테스트 시나리오 명세서 (Test Scenarios Specification)

본 문서는 Jungle Tools의 모든 백엔드 로직, API 엔드포인트, AWS 리소스 제어, WORM S3 Object Lock 감사 로깅, 멀티 계정 백업 모니터링 및 알림 연동 기능을 자동으로 검증하기 위한 **테스트 시나리오 및 실행 가이드**입니다.

---

## 1. 테스트 프레임워크 개요

Jungle Tools의 테스트 체계는 **Phase 1: 백엔드 단위 테스트(Unit Tests)**와 **Phase 2: 실환경 E2E 통합 테스트(Live Cloud E2E Tests)**의 2단계로 구성됩니다.

```
jungletools/
├── backend/
│   ├── package.json              # npm test 스크립트 ("node --test tests/*.test.mjs")
│   └── tests/
│       └── unit.test.mjs         # [Phase 1] 유틸리티 및 보안 검증 단위 테스트
└── scripts/
    ├── test-all.mjs              # [Phase 2] AWS SigV4 인증 기반 실환경 E2E 통합 테스트 러너
    ├── test-all.sh               # Linux / macOS 원클릭 통합 테스트 실행 스크립트
    └── test-all.ps1              # Windows PowerShell 원클릭 통합 테스트 실행 스크립트
```

---

## 2. 테스트 실행 방법

### 1) 원클릭 전체 테스트 실행 (단위 테스트 + 클라우드 E2E)
```bash
# Linux / macOS
./scripts/test-all.sh

# 특정 AWS 프로필 및 리전 지정 시
./scripts/test-all.sh [HUB_PROFILE] [REGION] [STACK_NAME]
```

```powershell
# Windows PowerShell
.\scripts\test-all.ps1
```

### 2) 백엔드 단위 테스트만 별도 실행
```bash
npm test --prefix backend
```

### 3) 대화형 인증 지원 (Interactive Authentication)
테스트 실행 시 지정된 AWS 프로필이 없거나 자격 증명이 만료된 경우, 터미널에서 자동으로 입력을 요청하여 테스트를 중단 없이 진행합니다:
```text
[AWS Authentication Required]
Authentication Options:
  1) Enter AWS Profile Name (e.g. l-iam-s2, default)
  2) Enter Access Key ID & Secret Access Key manually
Choose [1/2] (Default 1): 
```

---

## 3. 세부 테스트 시나리오 명세

### [Phase 1.1] 프론트엔드 UI 메뉴 탐색 및 인터랙션 테스트 (Frontend UI Tests - 6개 케이스)

Virtual DOM (JSDOM) 환경에서 `frontend/index.html`과 `frontend/app.js`를 구동하여 사이드바의 각 메뉴 클릭, 뷰 전환, 브레드크럼 동적 갱신, 프로필 선택, 모달 제어를 자동 검증합니다:

| 테스트 케이스 ID | 테스트 대상 UI | 사용자 동작 및 시나리오 | 기대 결과 (Expected Result) |
| :--- | :--- | :--- | :--- |
| `FE-NAV-01` | **Initial View & Footer** | **초기 로드 상태 검증**<br>- `DOMContentLoaded` 실행 후 기본 뷰 상태 | 1. `view-home`이 활성화(`active`)됨<br>2. 브레드크럼이 `Home`으로 표시됨<br>3. Target Account 드롭다운에 계정 번호 없는 간소화 명칭(`Hub (l-iam-s2)`) 노출<br>4. 사이드바 최하단에 API Endpoint 및 Role Name 출력 확인 |
| `FE-NAV-02` | **SG Manage Menu** | **보안 그룹 메뉴 클릭 및 뷰 전환**<br>- `#nav-sg-dashboard`, `#nav-sg-logs` 클릭 | 1. 대시보드 클릭 시 `view-sg-dashboard` 활성화 & 브레드크럼 `SG Manage` / **`Dashboard`**<br>2. 로그 클릭 시 `view-sg-logs` 활성화 & 브레드크럼 `SG Manage` / **`Logs`** |
| `FE-NAV-03` | **Backup Monitor Menu** | **백업 관제 및 알림 서브메뉴 순회 클릭**<br>- 대시보드, 슬랙 웹훅, 슬랙 이메일, SMTP, 주소 등록 메뉴 순차 클릭 | 1. 각 클릭 시 해당하는 뷰(`view-backup-dashboard`, `view-noti-slack-webhook`, `view-noti-slack-email`, `view-noti-email-smtp`, `view-noti-email-recipients`) 활성화<br>2. 브레드크럼에 다계층 경로(`Backup Monitor / Notification / Slack` / **`웹훅`** 등) 정확히 반영 |
| `FE-NAV-04` | **Home Quick Jump** | **홈 화면 퀵 액세스 바로가기 버튼**<br>- 대시보드 내 바로가기 버튼 5종 클릭 | 1. `#btn-home-goto-sg` ➔ SG 대시보드 이동<br>2. `#btn-home-goto-backup` ➔ 백업 대시보드 이동<br>3. `#btn-home-goto-slack` ➔ 웹훅 설정 이동<br>4. `#btn-home-goto-email` ➔ 수신자 주소 등록 이동<br>5. `#btn-home-goto-logs` ➔ 감사 로그 이동 |
| `FE-NAV-05` | **Profile Switch** | **Target Account(프로필) 드롭다운 변경**<br>- `#target-account-select` 값 변경 이벤트 발생 | `localStorage`에 선택된 계정 ID가 즉시 저장되고, 후속 API 요청 헤더(`X-Target-Role-Arn`)에 연동됨 |
| `FE-NAV-06` | **Modal Lifecycle** | **팝업 모달 열기/닫기 라이프사이클**<br>- SG 생성 모달 및 웹훅 추가 모달 트리거 | 1. 열기 버튼 클릭 시 모달 엘리먼트에 `open` 클래스 추가<br>2. 닫기/취소 버튼 클릭 시 `open` 클래스 정상 제거 |

---

### [Phase 1.2] 백엔드 로직 및 보안 단위 테스트 (Backend Unit Tests - 5개 스위트 / 13개 케이스)

| 스위트 | 테스트 케이스 ID | 테스트 항목 및 시나리오 | 기대 결과 (Expected Result) |
| :--- | :--- | :--- | :--- |
| **1. Email Validation** | `UT-EMAIL-01` | **표준 이메일 형식 검증**<br>- `admin@example.com`, `john.doe@company.co.kr`, `dev+test@domain.org` 등 | 유효성 통과 (`true`) |
| | `UT-EMAIL-02` | **비정상 이메일 차단 검증**<br>- 도메인 누락(`plain`), `@` 누락, 공백 포함, 빈 값, `null` | 유효성 실패 (`false`) |
| | `UT-EMAIL-03` | **다중 수신자 구분자 파싱 검증**<br>- 쉼표(`,`), 세미콜론(`;`), 줄바꿈으로 연결된 이메일 목록 일괄 검증 | 전체가 정상인 경우만 `true`, 하나라도 잘못된 포맷 포함 시 `false` |
| **2. Slack URL Validation** | `UT-SLACK-01` | **공식 Slack 웹훅 URL 검증**<br>- `hooks.slack.com/services/...`<br>- `hooks.slack.com/workflows/...`<br>- `hooks.slack.com/triggers/...` | 유효성 통과 (`true`) |
| | `UT-SLACK-02` | **보안 위협 및 스푸핑 URL 차단**<br>- 비보안 HTTP 프로토콜 차단<br>- 피싱 유사 도메인(`evil-hooks.slack.com`) 차단<br>- 허용되지 않은 임의 경로 차단 | 유효성 실패 (`false`) |
| **3. HTTP Response Builder** | `UT-HTTP-01` | **CORS 및 표준 응답 헤더 생성 검증**<br>- `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Credentials: true`<br>- `Content-Type: application/json; charset=utf-8` | 상태 코드 200 및 필수 보안/CORS 헤더가 정상 주입됨 |
| | `UT-HTTP-02` | **Origin 반사 및 CORS 자격증명 지원 검증**<br>- 요청 Origin(`http://localhost:3000`) 반사 및 자격 증명 쿠키 허용 | `Access-Control-Allow-Origin: http://localhost:3000` |
| | `UT-HTTP-03` | **오류 응답 직렬화 검증**<br>- 400 Bad Request, 500 Internal Server Error 생성 | 지정된 상태 코드 및 JSON 에러 메시지 반환 |
| **4. Cookie & BFF Session** | `UT-COOKIE-01` | **HTTP API v2 쿠키 배열 파싱 검증**<br>- `event.cookies` 배열에서 `jungle_session` 추출 | 세션 토큰 정확히 파싱 |
| | `UT-COOKIE-02` | **Cookie 헤더 문자열 파싱 검증**<br>- `event.headers.cookie` 문자열 파싱 | 세션 토큰 정확히 파싱 |
| | `UT-COOKIE-03` | **쿠키 부재/빈값 예외 처리 검증**<br>- 빈 객체, `null`, 헤더 없음 시 빈 딕셔너리 반환 | 예외 없이 `{}` 반환 |
| **5. IAM Security Pattern** | `UT-IAM-01` | **Cross-Account Role ARN 정규식 검증**<br>- `arn:aws:iam::<AccountID>:role/JungleToolsCrossAccountRole` | 패턴 일치 (`true`) |
| | `UT-IAM-02` | **비인가 IAM 엔티티 접근 차단 검증**<br>- `AdministratorAccess`, `root`, `user/...` 등 임의 역할 주입 시도 차단 | 패턴 불일치 (`false`) |

---

### [Phase 2] 실환경 E2E 통합 테스트 (Live Cloud E2E - 14개 시나리오)

| 시나리오 ID | 대상 서비스 | 테스트 항목 및 API | 테스트 절차 및 검증 기준 |
| :--- | :--- | :--- | :--- |
| `E2E-AUTH-01` | **BFF Security** | **비인가 요청 차단 검증**<br>`GET /security-groups` (쿠키 없음) | 1. 쿠키 없이 보호된 API 호출<br>2. API Gateway Authorizer가 `401 Unauthorized` 또는 `403 Forbidden` 차단하는지 검증 |
| `E2E-AUTH-02` | **BFF Auth** | **STS 자격 증명 검증 및 세션 쿠키 발급**<br>`POST /auth/login` | 1. AWS 자격 증명 전송<br>2. STS `GetCallerIdentity` 통과 후 `Set-Cookie: jungle_session=...; HttpOnly; Secure; SameSite=None` 발급 검증 |
| `E2E-AUTH-03` | **BFF Auth** | **활성 세션 및 신원 확인**<br>`GET /auth/me` | 1. 발급된 세션 쿠키로 세션 상태 조회<br>2. `authenticated: true` 및 사용자 `account`, `arn` 반환 검증 |
| `E2E-SG-01` | **SG Manage** | **VPC 및 보안 그룹 목록 조회**<br>`GET /security-groups` (쿠키 포함) | 1. 세션 쿠키를 포함하여 엔드포인트 호출<br>2. 응답 상태 코드 `200 OK`<br>3. `vpcs` 배열 내 유효한 `vpcId` 및 연결된 서브넷/CIDR 데이터 존재 검증 |
| `E2E-SG-02` | **SG Manage** | **임시 보안 그룹 생성**<br>`POST /security-groups` | 1. 첫 번째 VPC를 대상으로 `jungle-e2e-test-<timestamp>` 이름의 SG 생성 요청<br>2. 응답 상태 코드 `200 OK`<br>3. `sg-`로 시작하는 유효한 `groupId` 정상 발급 검증 |
| `E2E-SG-03` | **SG Manage** | **인바운드 방화벽 규칙 추가**<br>`PUT /security-groups/{id}/rules` | 1. 발급된 `groupId`에 TCP 8080 포트 (`10.0.0.0/16`) 인바운드 규칙 등록<br>2. 응답 상태 코드 `200 OK`<br>3. EC2 보안 그룹에 규칙이 정상 반영되었는지 검증 |
| `E2E-SG-04` | **SG Manage** | **임시 보안 그룹 삭제 및 정리**<br>`DELETE /security-groups/{id}` | 1. 생성된 임시 보안 그룹에 삭제 요청 전송<br>2. 응답 상태 코드 `200 OK`<br>3. 계정 내 리소스 누수 없이 정상 삭제 완료 검증 |
| `E2E-AUDIT-01` | **Audit & WORM** | **DynamoDB 감사 로그 및 WORM S3 Object Lock 검증**<br>`GET /audit-logs` | 1. 생성/수정/삭제 이벤트가 DynamoDB `SgAuditLogs` 테이블에 기록되었는지 확인<br>2. 감사 로그 항목에 `s3Location` 경로가 올바르게 생성되었는지 확인<br>3. **AWS S3 SDK를 직접 호출하여 해당 객체의 Object Lock 상태가 `GOVERNANCE` 모드로 잠겨 있는지 검증** |
| `E2E-BACKUP-01` | **Backup Monitor** | **EBS 스냅샷 및 볼륨 현황 조회**<br>`GET /backups/ebs` | 1. EBS 백업 관제 엔드포인트 호출<br>2. 응답 상태 코드 `200 OK`<br>3. `volumes` 및 `snapshots` 배열 스키마 정상 반환 검증 |
| `E2E-BACKUP-02` | **Backup Monitor** | **EFS 파일 시스템 백업 현황 조회**<br>`GET /backups/efs` | 1. EFS 백업 관제 엔드포인트 호출<br>2. 응답 상태 코드 `200 OK`<br>3. `fileSystems` 배열 스키마 정상 반환 검증 |
| `E2E-BACKUP-03` | **Backup Monitor** | **RDS 데이터베이스 스냅샷 조회**<br>`GET /backups/rds` | 1. RDS 백업 관제 엔드포인트 호출<br>2. 응답 상태 코드 `200 OK`<br>3. `instances` 및 `snapshots` 배열 스키마 정상 반환 검증 |
| `E2E-NOTI-01` | **Notifications** | **Slack 및 이메일 설정 라이프사이클**<br>`GET & POST /slack/config` | 1. 기존 설정 백업 (`GET /slack/config`)<br>2. 다중 수신자 이메일, 웹훅, SMTP 설정을 포함한 테스트 설정 저장 (`POST /slack/config`)<br>3. 응답 코드 `200 OK` 확인 후 기존 설정으로 완벽 복원 |
| `E2E-NOTI-02` | **Notifications** | **백업 종합 리포트 미리보기 생성**<br>`GET /slack/preview` | 1. 실시간 멀티 서비스(EBS/EFS/RDS) 종합 백업 리포트 생성 호출<br>2. 응답 상태 코드 `200 OK`<br>3. 리포트 본문 및 보호/미보호 자원 집계 데이터 정상 반환 검증 |
| `E2E-AUTH-04` | **BFF Auth** | **세션 로그아웃 및 쿠키 파기 검증**<br>`POST /auth/logout` | 1. 세션 파기 요청 전송<br>2. DynamoDB 세션 레코드 삭제 확인<br>3. 이후 `/auth/me` 호출 시 `401 Unauthorized` 정상 반환 검증 |

---

## 4. 테스트 성공 기준 (Success Criteria)

1. **프론트엔드 UI & 백엔드 단위 테스트 Pass Rate**: **100% (19/19 통과)**
2. **실환경 E2E 통합 테스트 Pass Rate**: **100% (14/14 통과)**
3. **전체 테스트 커버리지**: **총 33개 자동화 테스트 케이스 100% 통과**
3. **WORM Object Lock 무결성**: 생성된 감사 로그 객체가 `GOVERNANCE` 보존 모드로 잠겨 있어 삭제/변조가 차단됨을 확인.
4. **리소스 멱등성 및 정리**: E2E 테스트 과정에서 생성된 모든 임시 보안 그룹 및 설정이 테스트 종료 후 100% 원복/삭제되어 리소스 잔여물이 남지 않음.

---

## 5. 지속적 통합 (CI/CD) 연동 가이드

GitHub Actions 등 CI/CD 파이프라인에서 배포 전/후 자동 검증 단계로 활용할 수 있습니다:

```yaml
name: Jungle Tools Automated Verification
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      # 1. 단위 테스트 실행
      - name: Run Unit Tests
        run: |
          npm install --prefix backend
          npm test --prefix backend
      
      # 2. 실환경 E2E 테스트 실행 (AWS 자격 증명 설정 시)
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2
      
      - name: Run Live Cloud E2E Tests
        run: ./scripts/test-all.sh
```
