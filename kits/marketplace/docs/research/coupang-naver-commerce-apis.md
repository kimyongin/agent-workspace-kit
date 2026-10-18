# 쿠팡·네이버 스마트스토어 Open API 비교 조사

조사일: 2026-10-18 (Asia/Seoul). 공식 공개 문서와 공식 운영자의 기술지원 답변을 확인했다. 판매자 계정 로그인, 키 발급, 실제 데이터 조회·변경은 하지 않았다. 아래의 ‘확인’은 공개 문서상 지원을 뜻하며 계정별 사용 권한이나 운영 동작을 보장하지 않는다. 구현 제안은 별도로 표시한다.

## 1. 결론

두 플랫폼 모두 **판매자가 권한을 가진 상점의 상품·주문·클레임·정산 업무를 연동하는 용도**에 적합하다. 쿠팡은 WING 판매자의 키를 사용하는 Open API, 네이버는 애플리케이션 권한과 토큰을 사용하는 커머스API가 대상이다. [쿠팡 키 발급](https://developers.coupang.com/ko/getting-started/issue-open-api-keynew), [네이버 소개](https://apicenter.commerce.naver.com/docs/introduction)

구현 판단: 첫 단계는 상품·주문·클레임의 **조회와 운영 알림**, 두 번째는 송장 등록과 재고 반영이 적절하다. 상품 신규 등록·수정, 환불을 유발하는 클레임 승인은 카테고리별 입력 제약과 상태 전이 검증을 갖춘 뒤 추가하는 편이 좋다. 전체 시장의 경쟁상품·판매량을 자유롭게 수집하는 API로 전제하면 안 된다. 공개 문서에서 권한 없이 경쟁 판매자의 주문·정산 원장에 접근하는 계약은 확인하지 못했다.

다른 판매자에게 제공하는 SaaS라면 인증 방식부터 달라진다. 특히 네이버 ‘내스토어 애플리케이션’ 인증정보를 고객에게 받아 대행하는 구조는 공식 답변상 제3자 제공·위탁 금지 취지와 충돌할 수 있다. 솔루션의 구독·판매자 권한 모델을 먼저 검토해야 한다. [네이버 공식 답변, 2026-02-03](https://github.com/commerce-api-naver/commerce-api/discussions/3208)

## 2. 비교표

| 항목 | 쿠팡 Open API | 네이버 커머스API |
| --- | --- | --- |
| 자체 상점 시작 | 사업자 인증을 마친 WING 판매자가 키 신청. 자체개발 또는 연동업체 선택 | 커머스API센터 가입과 애플리케이션 등록. 통합 매니저 권한을 가진 스토어 자산 접근 |
| 인증 | Access Key·Secret Key로 요청마다 HMAC-SHA256 서명 | OAuth 2.0 Client Credentials로 토큰 발급 후 Bearer 인증. 발급 요청에 bcrypt 기반 전자서명 |
| 다수 판매자 서비스 | 판매자가 연동업체 선택. 업체 목록 등록 신청 안내가 있음 | 솔루션 등록·심사·구독. SELLER 토큰에 판매자 account_id 사용 |
| 상품 | 생성·수정·승인·조회, 옵션 아이템별 가격·수량·판매 상태 | 원상품·채널상품·그룹상품, 상품 등록·수정·검색, 옵션 재고·벌크 변경 |
| 주문·배송 | 발주서 목록·단건, 상품준비중, 송장 업로드, 배송 상태 | 변경 상품 주문·상세 조회, 발주 확인·발송 처리 |
| 클레임 | 반품·취소 요청과 교환 API 그룹 | 주문 API 내 취소·반품·교환 처리 |
| 정산 | 매출내역·지급내역 조회 | 건별·일별 정산, 수수료 상세, 부가세 내역 |
| 물류 재고 | 일반 판매 아이템 재고와 로켓그로스 창고 재고 API 구분 | 상품/옵션 재고와 N배송 SKU 도메인 구분 |

표의 근거: [쿠팡 키 발급](https://developers.coupang.com/ko/getting-started/issue-open-api-keynew), [HMAC](https://developers.coupang.com/ko/getting-started/creating-hmac-signature), [상품 API](https://developers.coupang.com/ko/api/products?market=KR), [전체 API](https://developers.coupang.com/ko/api), [네이버 가입 FAQ](https://apicenter.commerce.naver.com/ko), [인증](https://apicenter.commerce.naver.com/docs/auth), [솔루션 기본 연동](https://apicenter.commerce.naver.com/docs/solution-doc/3000/기본-연동-요소-가이드), [공식 도메인·엔드포인트 인덱스](https://apicenter.commerce.naver.com/llms/llms.txt).

## 3. 신청·인증과 운영 조건

### 쿠팡

키 발급 문서는 자체개발 서버 IP 최대 10개 등록, 키 유효기간 180일, 만료 14일 전 재발급 버튼 활성화를 안내한다. 최초 발급 후 접근 권한 반영에 24시간 이상 걸릴 수 있고, 별도 테스트 환경은 제공하지 않는다고 명시한다. 연동업체는 하나만 선택 가능하다고 안내되어 있으므로 기존 셀러툴과 함께 도입할 때 확인이 필요하다. [키 발급 안내](https://developers.coupang.com/ko/getting-started/issue-open-api-keynew)

요청 예제의 호스트는 `https://api-gateway.coupang.com`이다. 서명은 UTC 시각·HTTP 메서드·경로·쿼리를 조합한다. 구현 제안: 서명에 사용한 쿼리와 실제 전송 인코딩을 일치시키고 서버 시각을 동기화한다. 공식 Python 예제에는 인증서·호스트 검증을 끄는 코드와 Authorization 출력이 있으므로 운영 코드에 그대로 복사하지 말고 TLS 검증을 켜고 인증 로그를 제거한다. [HMAC 예제](https://developers.coupang.com/ko/getting-started/creating-hmac-signature)

문서 포털은 `developers.coupang.com`을 기준으로 삼는다. 구 포털 v1은 2026-10-31 운영 종료, 11-01부터 이용 불가 예정이다. 이 공지는 **문서 포털 종료**이며 판매자 Open API 자체의 종료를 의미하지 않는다. [2026-10-06 공식 공지](https://developers.coupang.com/ko/notices/54f5ef70-1092-47ee-8b4d-aca14f228df7)

### 네이버

토큰 URL은 `https://api.commerce.naver.com/external/v1/oauth2/token`이다. `client_id_timestamp`를 password, `client_secret`을 salt로 bcrypt 해싱한 뒤 Base64 인코딩해 전자서명을 만든다. API에는 Bearer 토큰을 보낸다. OAuth의 사용자 로그인 리다이렉트 방식으로 추정해서는 안 된다. 문서는 OAuth scopes 대신 API 그룹 권한을 안내한다. [인증](https://apicenter.commerce.naver.com/docs/auth), [권한 그룹](https://apicenter.commerce.naver.com/docs/restriction)

솔루션 연동 문서에서 SELF는 솔루션 자체 API, SELLER는 구독 판매자의 데이터 접근에 사용한다. SELLER는 판매자별 `account_id`가 필요하다. 기본 토큰 유효시간은 180분이며 남은 시간이 30분 미만이면 새 토큰 발급이 가능하다. 구현 제안: 판매자별 토큰 캐시와 동시 갱신 제어를 둔다. [기본 연동 요소](https://apicenter.commerce.naver.com/docs/solution-doc/3000/기본-연동-요소-가이드)

솔루션마켓 판매에는 입점동의와 심사가 있다. 심사 요청 조건에는 구독 이력, API 호출 IP 등록, API 그룹 추가 사유 작성이 포함된다. 단순한 내 상점 연결과 다른 판매자용 서비스 출시를 같은 절차로 산정하면 안 된다. [개발사 입점동의](https://apicenter.commerce.naver.com/docs/solution-doc/1000/개발사-입점-동의), [심사](https://apicenter.commerce.naver.com/docs/solution-doc/5000/솔루션-심사)

## 4. 변경 수집과 호출 제한

### 쿠팡: 주문·반품·교환을 각각 수집

발주서 분단위 조회는 24시간 미만 구간으로 나누어야 한다. 반품완료 건은 발주서 목록에서 조회되지 않으므로 반품/취소 요청 API를 함께 사용한다. 결제완료 상태에서 배송지가 바뀔 수 있어 상품준비중 처리 후 단건 재조회로 배송지를 확인하라는 명시적 안내가 있다. [발주서 목록 조회](https://developers.coupang.com/ko/api/shipments/po-list-query-by-minute?market=KR)

2026-03-17 공지는 일부 API의 호출 기준을 초당 10회에서 5회로 조정한다고 안내한다. 구 정책은 vendorId 단위 제한과 429, 제한 회복에 수분~수십분이 걸릴 수 있음을 설명한다. 모든 API가 동일하게 5회로 보장되는 것으로 해석하면 안 된다. 로켓창고 재고는 별도로 분당 50회 이하를 명시한다. [새 호출 정책 공지](https://developers.coupang.com/ko/notices/optimization-and-adjustment-of-open-api-rate-limiteffective-march-17th2026), [기존 정책 상세](https://developers-v1.coupangcorp.com/hc/ko/articles/20414599556889-Open-API-속도제한-정책-도입-안내), [로켓창고 재고](https://developers.coupang.com/ko/api/rocket-growth/rg-inventory-api?market=KR)

### 네이버: 변경 피드 → 상품 주문 상세

`GET /v1/pay-order/seller/product-orders/last-changed-statuses`는 변경 일시 기준으로 조회한다. 기본 최대 300건(또는 limitCount)이며 `more.moreFrom`과 `more.moreSequence`를 다음 요청에 전달해 끝까지 읽는다. 변경 식별 데이터만으로 상세가 완성되지 않으므로 상세 조회를 이어야 한다. [변경 상품 주문 내역](https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-get-last-changed-status-pay-order-seller), [조회 API 선택에 관한 공식 답변](https://github.com/commerce-api-naver/commerce-api/discussions/3208)

요청 제한은 개별 API와 인증된 애플리케이션 단위의 Token bucket이다. 응답의 `GNCP-GW-RateLimit-*` 헤더를 읽어야 하며, 판매자 리소스에는 별도 Quota가 적용될 수 있다. 초과 시 각각 `429 / GW.RATE_LIMIT`, `429 / GW.QUOTA_LIMIT`로 구분한다. 수치는 내부 정책에 따라 유동적이므로 ‘항상 초당 N회’로 고정하지 않는다. [제약 사항](https://apicenter.commerce.naver.com/docs/restriction)

### 공통 구현 제안

- 마지막 수집 시각과 페이지 커서를 영속 저장하고, 짧게 겹치는 시간 구간을 다시 조회해 중복 제거한다. 쿠팡 발주서 시간 구간을 네이버의 최종 변경 피드와 같은 의미로 취급하지 않는다.
- 판매자별 요청 큐를 두고 주문 수집·출고를 상품 전체 동기화보다 우선한다. 429와 일시 오류는 지수 백오프·지터로 재시도하고 인증·권한·입력 오류는 별도로 처리한다.
- 조회 성공 시각, 마지막 반영 시각, 실패 건수와 지연 시간을 노출한다. 정기 재대사로 폴링 누락을 확인한다.
- 송장·재고·환불 요청에서 시간초과가 발생하면 성공 여부를 재조회한 뒤 재시도한다. 네트워크 재시도를 사업 명령의 멱등성과 혼동하지 않는다.

웹훅: 쿠팡 홈페이지에는 Webhook 표기가 있지만 이번 조사에서는 주문 이벤트의 구독·서명 검증·재전송 계약을 확인하지 못했다. 네이버에서도 범용 주문 웹훅 계약은 확인하지 못했다. 따라서 MVP 견적은 폴링을 기준으로 하고, 지원이 없다고 단정하지 않는다. [쿠팡 홈](https://developers.coupang.com/ko), [네이버 API 목록](https://apicenter.commerce.naver.com/docs/commerce-api/current)

## 5. 데이터 모델·재고·정산의 함정

쿠팡은 `sellerProductId`와 판매 아이템 `vendorItemId`를 구분하고, 네이버는 원상품·채널상품·그룹상품·옵션을 구분한다. 상품 이름으로 플랫폼 간 상품을 매칭하기보다 내부 SKU와 외부 식별자의 대응표가 필요하다. [쿠팡 상품 API](https://developers.coupang.com/ko/api/products?market=KR), [네이버 상품 가이드 인덱스](https://apicenter.commerce.naver.com/llms/llms.txt)

구현 제안: 주문·주문항목·배송묶음·클레임·정산을 분리한다. 외부 ID는 계산용 숫자로 취급하지 말고 문자열로 저장하며, JSON 숫자 원문을 파싱하는 단계부터 정밀도를 보존한다. 공통 상태는 표시와 검색에 쓰되 원본 상태·사유 코드를 함께 남긴다. 취소와 교환의 세부 흐름을 한 개의 주문상태 enum으로 압축하면 후속 처리에 필요한 정보가 소실될 수 있다.

일반 판매 아이템의 판매 가능 재고와 물류창고 재고는 의미가 다르다. 로켓창고 재고는 국내 쿠팡 물류센터의 주문 가능 수량 등을 반환하며, 네이버에는 상품 옵션 재고 변경과 N배송 SKU가 별도로 있다. [로켓창고 재고](https://developers.coupang.com/ko/api/rocket-growth/rg-inventory-api?market=KR), [네이버 재고·N배송 인덱스](https://apicenter.commerce.naver.com/llms/llms.txt)

구현 제안: 두 채널에 동일한 재고 수량을 무조건 덮어쓰면 동시 주문에 초과판매가 날 수 있다. 재고의 기준 시스템, 주문 예약 수량, 안전재고, 취소 복원 시점을 먼저 정한다. API 지원만으로 플랫폼 간 원자적 재고 차감이 보장되는 것은 아니다.

정산은 쿠팡 매출/지급 내역과 네이버 정산/수수료/부가세 데이터의 구성이 다르다. [쿠팡 정산 API 목록](https://developers.coupang.com/ko/api), [네이버 정산 엔드포인트 인덱스](https://apicenter.commerce.naver.com/llms/llms.txt)

구현 제안: 결제금액·매출·정산예정액·실제 입금액을 구분하고, 취소·반품·배송비·수수료의 부호와 귀속일을 원장 단위로 대사한다. API로 회계가 자동 확정된다고 보지 말고 판매자센터 명세와 검증한다.

## 6. 개인정보와 기능 한계

네이버 공식 운영자는 구매자의 네이버 ID를 마스킹해서 제공하며 마스킹 수준을 변경할 수 없다고 설명한다. 상품 Q&A 작성자를 주문·구매자와 연결하는 식별정보도 제공하지 않는다고 확인한다. 따라서 마스킹 ID로 고객을 합치거나 이메일 주소를 복원하는 CRM 설계를 전제해서는 안 된다. [데이터 제공 범위, 2026-02-10](https://github.com/commerce-api-naver/commerce-api/discussions/3226), [Q&A 작성자, 2026-06-12](https://github.com/commerce-api-naver/commerce-api/discussions/3547)

쿠팡 발주서 응답에는 수취인·주소 등 배송 정보가 있다. 구현 제안: 운영에 필요한 필드만 저장하고 판매자별 접근 격리, 암호화, 보유·파기 정책, 로그 마스킹을 적용한다. 고객 개인정보를 일반 분석 로그나 AI 프롬프트에 그대로 넣지 않는다. API 조회 가능 기간과 앱이 해당 개인정보를 보유할 수 있는 기간은 별개로 확인한다. [발주서 응답 명세](https://developers.coupang.com/ko/api/shipments/po-list-query-by-minute?market=KR)

네이버 공식 답변은 2026-03-18 기준 리뷰 정보를 스마트스토어센터에서 확인하도록 안내한다. 리뷰·톡톡·광고·외부 고객 식별 등을 상품·주문 API와 함께 자동 지원한다고 가정하지 않는다. 필요한 기능은 별도 제품/API의 공개와 권한을 확인한다. [리뷰 관련 공식 답변](https://github.com/commerce-api-naver/commerce-api/discussions/3309)

## 7. 권장 MVP와 착수 조건

아래는 조사 결과에 따른 구현 제안이며 확정 제품 스펙이 아니다.

| 단계 | 범위 | 완료 판단 |
| --- | --- | --- |
| 1. 읽기 연동 | 판매자 연결, 상품·SKU 매핑, 주문·클레임 수집, 운영 알림 | 판매자센터의 일정 기간 주문·취소·반품과 건수/금액 일치, 재시작 후 커서 복구 |
| 2. 출고·재고 | 발주 확인, 최신 배송지 확인, 송장 반영, 명시한 SKU의 재고 동기화 | 부분 실패·중복 요청·시간초과 후 재조회 검증, 초과판매 대응 |
| 3. 정산 보조 | 일별/건별 정산 적재와 차이 표시 | 수수료·반품·배송비가 포함된 표본을 명세와 대사 |
| 이후 | 상품 신규 등록·카테고리별 수정, 클레임 처리 자동화, 다수 판매자 출시 | 입력 스키마·승인·권한·상태 전이·운영 책임 확정 |

착수 전에 확인할 것은 내 상점 도구인지 판매자용 SaaS인지, 판매자 계정과 기존 연동업체 상태, 필요한 API 그룹, 일반배송과 로켓그로스/N배송 포함 여부, 예상 일 주문량, 재고 기준 시스템이다. 이 답에 따라 인증·심사·저장 모델과 호출량이 달라진다.

## 8. 남은 검증

- 계정별 실제 권한, 호출 헤더·제한, 키 발급·IP 반영 시간, 운영 데이터 누락률은 미검증이다.
- 모든 API의 최대 과거 조회 기간·보존 기간·필드별 개인정보 마스킹 시점을 일괄 확정하지 않았다. 필요한 엔드포인트와 판매자 유형별로 검증해야 한다.
- 쿠팡 가이드의 별도 테스트 환경 미제공 안내와 홈의 Mock 호출 안내가 함께 있어, 현재 신규 포털 Mock의 범위 및 실제 판매 흐름 테스트 가능 여부는 추가 확인이 필요하다. [키 발급 가이드](https://developers.coupang.com/ko/getting-started/issue-open-api-keynew), [홈](https://developers.coupang.com/ko)
- 네이버 전체 인덱스는 읽었으나 일부 `.md` 상세 문서는 브라우저 도구에서 불러오지 못했다. 표의 광범위 기능은 공식 인덱스에 근거하며, 미열람 상세 스키마의 수치나 동작은 확정하지 않았다. [공식 인덱스](https://apicenter.commerce.naver.com/llms/llms.txt)
- 양사의 문서 개수·홈페이지 표기·과거 공지와 최신 세부 계약이 항상 일치한다고 보장하지 않는다. 구현 시 신규 공지와 해당 API의 현재 명세를 다시 대조한다.
