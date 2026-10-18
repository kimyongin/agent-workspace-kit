# G마켓·옥션·11번가 Open API 비교 조사

조사일: 2026-10-18 (Asia/Seoul). 공식 공개 문서·FAQ·공지 기준이다. 판매자 계정 로그인, 키 신청, 실제 상품·주문 조회나 변경은 하지 않았다. ‘지원 확인’은 문서에 기능이 있다는 의미이며 계정별 권한이나 실제 응답 검증을 뜻하지 않는다. 구현 제안과 미확인 사항은 구분했다.

## 1. 결론

**세 플랫폼 모두 판매자 상품·재고·주문·배송·클레임 연동 대상이다. G마켓과 옥션은 ESM Trading API를 공동 사용하므로 공통 구현을 활용할 수 있지만, 판매자·사이트·권한·상품번호·정산 의미를 합쳐서는 안 된다.** ESM 가이드는 사이트별 판매자 가입과 마스터 ID, 별도 신청·승인을 요구한다. 11번가는 API 관리에서 인증키를 발급하는 별도 체계다. [ESM API 가이드](https://etapi.gmarket.com/pages/API-가이드), [11번가 Open API 센터](https://openapi.11st.co.kr/openapi/OpenApiFrontMain.tmall)

구현 판단: 개발량을 추정하기 전에 **ESM 승인 가능 여부와 허용 API 범위부터 확인**하는 편이 좋다. 11번가는 상품검색 API와 판매자 업무 API를 구분하고, 승인된 판매자 계정으로 실제 명세를 확인해야 한다. 다수 판매자용 서비스는 단일 판매자 자체개발과 같은 신청으로 간주하지 않는다.

## 2. 비교표

| 항목 | G마켓·옥션: ESM Trading API | 11번가 Open API |
| --- | --- | --- |
| 시작 조건 | 양 사이트 판매자 회원·ESM 마스터 ID, 메일 신청·권한 승인 | 11번가 로그인·API 관리에서 서비스 등록 및 키 발급. 판매자 승인 대기 중 API 가입 실패 가능 |
| 인증 | Secret Key로 HS256 JWT 생성, Authorization: Bearer. 키·허용 IP·리소스 권한 검사 | API KEY 사용. 판매자 REST 요청의 정확한 헤더·허용 IP 등록 절차는 이번 비로그인 조사에서 미확인 |
| 데이터 형식 | 주요 상품·주문 API는 HTTP 메서드별 엔드포인트와 JSON 명세 | 공식 홈은 HTTP/XML 안내. 공식 FAQ에 판매자 REST 경로 확인. REST와 JSON은 같은 뜻이 아님 |
| 상품·재고 | 2.0 마스터 상품 아래 사이트별 상품, 양사 동시 또는 개별 등록·수정, 가격·재고·판매상태 API | 상품·옵션·상세설명 등록/수정, 판매기간·판매중지·재고 관리 |
| 주문·배송 | 결제완료 주문조회, 주문확인, 발송·배송 상태·이력, 클레임 별도 조회 | 주문 목록·내역, 발주·발송·입고 관련 업무 |
| 클레임 | 취소·반품·교환·미수령 API, 일부 제한 권한 | 취소·교환·반품 조회 및 승인·거부·보류 등의 흐름 |
| 정산 | 판매대금·배송비·글로벌셀러 예치금 송금 조회 확인 | 공개 서비스 소개에서 정산 전용 API를 확인하지 못함. 미지원으로 단정하지 않음 |
| 주요 운영 이슈 | 승인은 보장되지 않음, API별 호출 제한, 사이트별 데이터 차이 | Seller API 키 180일 정책, 호출 시 자동 연장·만료 후 재발급 |

표 근거: [ESM 가이드](https://etapi.gmarket.com/pages/API-가이드), [상품 API](https://etapi.gmarket.com/20), [주문·배송 API](https://etapi.gmarket.com/category/주문%20%7C%20배송%20API), [정산 API](https://etapi.gmarket.com/category/정산조회%20API), [11번가 상품 소개](https://openapi.11st.co.kr/openapi/OpenApiServiceIntroduce.tmall?introduceType=PRODUCT), [주문 소개](https://openapi.11st.co.kr/openapi/OpenApiServiceIntroduce.tmall?introduceType=ORDER), [FAQ](https://openapi.11st.co.kr/openapi/OpenApiFaqBoard.tmall?method=getFaqBoardList&unityBrdNo=55).

## 3. ESM: 신청·인증·사이트 구분

ESM은 신청서에 개발 범위, 마스터 ID, 서비스 URL, 최근 3개월 매출, 개발 기간을 기재하도록 안내한다. 셀링툴 업체도 업체 사업자로 **G마켓·옥션 사이트별 판매자 가입**이 필요하며 소개 자료와 사이트별 이용 판매자 수도 요구한다. 내부 리소스·서비스 안정성에 따라 권한 부여가 거절될 수 있다. 개발 테스트 후 운영 사용 일정을 협의한다. 따라서 키를 즉시 셀프 발급해 누구나 운영할 수 있다고 가정하면 안 된다. [공식 API 가이드](https://etapi.gmarket.com/pages/API-가이드)

인증 예제는 `alg: HS256`, `kid: ESM 마스터 ID`, `sub: sell`, `ssi: A:옥션판매자ID,G:지마켓판매자ID`를 사용한다. 셀링툴의 `kid`에는 셀링툴 자체 마스터 ID를 넣도록 명시한다. 가이드의 ‘public/private key’라는 표현과 별개로 실제 예제는 **공유 Secret Key를 이용한 HMAC-SHA256 서명**이다. 비대칭키 인증으로 구현하지 않는다. 최신 상품·주문 명세의 서버는 `sa2.esmplus.com`이지만 인증 예제의 `aud`는 `sa.esmplus.com`으로 고정 안내되어 있으므로 호스트에 맞춰 임의 변경하지 말고 발급 시 확인한다. [인증·권한 가이드](https://etapi.gmarket.com/pages/API-가이드), [현재 상품 경로](https://etapi.gmarket.com/20), [현재 주문 경로](https://etapi.gmarket.com/67)

ESM의 공통 관리와 API 사용 권한은 별개다. 인증에 성공해도 특정 API 권한이 없으면 차단된다. 배송완료 API도 별도 권한이 필요하다. 판매자 위임·서비스 제공사 지정의 실제 화면, 사이트별 승인 상태, 기존 솔루션과 병행 가능 여부는 판매자 로그인 후 확인해야 한다. [ESM 가이드](https://etapi.gmarket.com/pages/API-가이드), [배송완료 API가 포함된 공식 목록](https://etapi.gmarket.com/category/주문%20%7C%20배송%20API)

## 4. ESM: 기능과 운영 제약

### 상품·재고

2.0 상품은 `goodsNo` 마스터 상품 아래 G마켓·옥션 상품번호를 생성한다. 양 사이트 동시 등록·수정과 사이트별 개별 등록·수정이 가능하고, 수정에는 마스터 번호를 사용한다. 마스터↔사이트 상품번호 조회 API도 있다. 상품 등록은 카테고리·배송 정책·옵션 등의 채널 제약을 함께 처리해야 하므로 단순 상품명·가격 전송으로 끝나지 않는다. [상품등록/수정/전환/조회](https://etapi.gmarket.com/20), [상품번호 매핑](https://etapi.gmarket.com/30)

재고 수정 전용 API는 **본품만 판매하는 상품**에 한정되며 옵션 사용 상품과 풀필먼트 스타배송 상품은 대상이 아니다. 옵션·물류 재고는 해당 도메인의 계약을 따로 확인해야 한다. 또한 재고 전용 API의 수량 입력 범위는 1~99,999이므로 재고 0을 보내 품절을 표현하는 일반화를 하지 않는다. [재고 수정](https://etapi.gmarket.com/194), [가격·재고·판매상태 기능 목록](https://etapi.gmarket.com/category/상품API/상품관리%20기능별%20API)

### 주문·배송·클레임

주문조회는 사이트 구분과 상태를 받아 결제완료 주문을 조회하며, 취소·반품·교환·미수령신고 건은 별도 API로 수집해야 한다. 조회 구간은 31일 이내로 안내된다. 선물 수락 전후 옵션이 바뀔 수 있으며 발송마감일도 주문 이후 계산된다. 구현 제안: 최초 수집 결과만으로 출고를 확정하지 말고 실제 출고 직전에 상태·배송 정보·옵션을 재확인한다. [주문조회](https://etapi.gmarket.com/67)

주문확인은 배송준비중 상태로 바꾸며 구매자의 취소 처리에도 영향을 준다. 발송처리는 송장·택배사와 연결되고 취소 요청 주문의 취소거부 기능도 수행하므로 단순 기록 API로 취급하면 안 된다. 클레임에는 사이트별 차이와 제한 API가 있다. 예를 들어 옥션 거래완료 후 환불은 G마켓에는 적용되지 않는다. [주문·배송 API](https://etapi.gmarket.com/category/주문%20%7C%20배송%20API), [클레임 API](https://etapi.gmarket.com/category/클레임%20API)

### 정산

판매대금, 배송비, 글로벌셀러 예치금 송금 조회가 공개되어 있다. 판매대금의 주문번호는 `OrderNo`가 아닌 `ContrNo`, 장바구니 번호는 `PackNo`다. 환불금은 정상 송금 금액의 역부호로 반환된다. 송금일 기준 당일 데이터는 영업일 D+1 조회로 안내한다. 배송비 조회는 G마켓의 장바구니 번호와 옥션의 묶음배송·장바구니 번호 구분을 보존해야 한다. [판매대금 명세](https://etapi.gmarket.com/41), [배송비·예치금 포함 정산 목록](https://etapi.gmarket.com/category/정산조회%20API)

### 호출 제한·콜백·테스트

- 상품 목록 조회 `/item/v1/goods/search`는 **2026-08-10부터 분당 최대 20회**로 제한된다고 공지했다. 이 수치를 전체 API 공통 제한으로 확장하지 않는다. [2026-07-28 공지](https://etapi.gmarket.com/220)
- 주문조회는 **5초당 1회**, 주문번호 조회는 해당 제한 예외로 안내된다. 제한 집계 단위와 다른 API별 제한은 승인 과정에서 추가 확인이 필요하다. [주문조회](https://etapi.gmarket.com/67)
- 범용 주문 이벤트 웹훅의 구독·검증·재전송 계약은 이번 조사에서 확인하지 못했다. 별도의 옥션 실시간 가격·재고 체크는 제휴사 URL로 XML을 전송하는 제한 제공 기능이다. 양사 개발이 필요하고 무응답이어도 주문이 진행되므로 주문 웹훅이나 초과판매 차단 보장으로 취급하지 않는다. [실시간 체크](https://etapi.gmarket.com/87)
- 가이드에 테스트 완료 후 운영 일정 협의가 있지만 공개 샌드박스 주소·테스트 키·주문 생성 절차는 확인하지 못했다. 별도 환경이 없다고 단정할 수는 없다. [개발 절차](https://etapi.gmarket.com/pages/API-가이드)

### 조사 시점 최신 변경

2026-10-13 적용 예정 공지는 옥션 주문조회에서 기존 `SellerDiscountPrice`의 의미를 판매자 아이템 할인으로 좁히고 판매자 분담 할인은 `SellerFundingDiscountPrice`로 분리한다고 안내한다. 기존 계산식을 그대로 쓰면 할인 합계가 달라질 수 있다. 별도로 10-15 일정의 서버 암호화 설정 변경 공지가 있다. 모두 공지 기준이며 실제 운영 적용을 호출로 검증하지 않았다. [할인 필드 변경](https://etapi.gmarket.com/223), [서버 보안 변경](https://etapi.gmarket.com/222)

## 5. 11번가: 발급·인증·기능

공식 센터는 로그인 후 API 관리에서 서비스 등록·인증키 발급을 안내한다. 신규 판매자 가입·판매자 전환 후 승인이 완료되지 않으면 API 가입이 실패할 수 있다. API 관리의 실제 발급 화면은 로그인 없이 확인하지 못했으므로, 직접개발 서버 IP 등록 항목·개수, 호스팅사 선택, 솔루션 사업자 등록·심사·판매자 위임 방식은 **계정으로 후속 확인할 항목**이다. 외부 솔루션 가이드의 과거 화면을 현재 공식 계약으로 대체하지 않았다. [센터](https://openapi.11st.co.kr/openapi/OpenApiFrontMain.tmall), [공식 FAQ](https://openapi.11st.co.kr/openapi/OpenApiFaqBoard.tmall?method=getFaqBoardList&unityBrdNo=55)

공식 홈은 HTTP/XML을 사용한다고 명시하며 SOAP와 구분한다. 공식 FAQ에는 판매자 상품조회용 `/rest/prodmarketservice/prodmarket` 경로도 나온다. 따라서 ‘XML이므로 SOAP’ 또는 ‘REST이므로 JSON’으로 단정하면 안 된다. 이번 비로그인 개발 가이드 기본 페이지는 일반 상품검색 `ProductSearch`와 URL 쿼리의 `key`를 설명한다. **이 검색 API 호출 방식을 판매자 주문 API 인증·접근 권한으로 일반화하지 않는다.** 판매자 API의 정확한 인증 헤더·요청/응답 전문과 현행 HTTPS 경로는 로그인 후 확인이 필요하다. [공식 홈](https://openapi.11st.co.kr/openapi/OpenApiFrontMain.tmall), [판매자 REST 경로가 명시된 FAQ](https://openapi.11st.co.kr/openapi/OpenApiFaqBoard.tmall?method=getFaqBoardList&unityBrdNo=55), [공개 상품검색 개발 가이드](https://openapi.11st.co.kr/openapi/OpenApiGuide.tmall)

지원 범위는 다음과 같다.

| 업무 | 공개 공식 근거로 확인된 기능 | 남은 확인 |
| --- | --- | --- |
| 상품·재고 | 상품/옵션/상세설명 등록·수정, 판매기간, 재고 조회·관리, 판매중지·해제 | 옵션별 전문·벌크 수량·부분 실패·카테고리 제약 |
| 배송 정책 | 출고지 조회, 반품/교환지·배송 정책 관리 | 주소지 유형별 현행 필수값 |
| 주문·출고 | 주문 목록·내역, 발주·발송·입고 | 변경분 조회 기준, 조회 구간·페이지·식별자, 송장 수정 상세 |
| 클레임 | 취소·교환·반품 요청/완료/철회 조회, 승인·거부, 반품 보류 등 | 상태별 허용 명령, 부분 처리·환불 영향 |
| 정산 | 이번 공개 소개·가이드에서 전용 API 미확인 | 판매대금·수수료·배송비·세금 관련 API 존재와 권한 |
| CS | 상품 Q&A·구매후기 조회와 답변 등록, 긴급알리미 API 분류 | 구매후기 제공 필드, 긴급알리미가 주문 이벤트 통지를 뜻하는지 |

근거: [상품 소개](https://openapi.11st.co.kr/openapi/OpenApiServiceIntroduce.tmall?introduceType=PRODUCT), [주문 소개](https://openapi.11st.co.kr/openapi/OpenApiServiceIntroduce.tmall?introduceType=ORDER), [클레임 소개](https://openapi.11st.co.kr/openapi/OpenApiServiceIntroduce.tmall?introduceType=CLAIM), [클레임 흐름 FAQ](https://openapi.11st.co.kr/openapi/OpenApiFaqBoard.tmall?method=getFaqBoardList&unityBrdNo=55). 미확인은 미지원 판정이 아니다.

## 6. 11번가: 180일 키 정책과 운영 조건

2026-06-24 게시 공지는 6-30 시행 인증키 유효기간 180일 정책을 안내한다. FAQ의 현행 설명은 다음과 같다. **계속 사용하는 키를 180일마다 무조건 교체하는 정책은 아니다.** [공지 목록](https://openapi.11st.co.kr/openapi/OpenApiNoticeBoard.tmall?method=getNoticeBoardList&noticeYn=Y&unityBrdNo=18), [키 정책 FAQ](https://openapi.11st.co.kr/openapi/OpenApiFaqBoard.tmall?method=getFaqBoardList&unityBrdNo=55)

- 상품 등록·수정·조회 등 호출 이력이 생기면 마지막 호출부터 180일 자동 연장된다.
- 만료 60일 전부터 수동 갱신할 수 있으며 만료 전 갱신은 키 값을 유지한다.
- 만료되면 상품·주문·재고 등 모든 OpenAPI 호출과 셀링툴 연동이 차단된다. 만료 후에는 갱신이 아닌 재발급만 가능하다.
- 재발급하면 기존 키가 즉시 폐기되므로 연동 시스템의 키를 다시 설정해야 한다. 기본적인 유효기간 관리 책임은 판매자에게 있다.

공개 약관은 이용 가능 시간·횟수를 별도 지정할 수 있으며 과도한 사용에 제한을 둘 수 있다고 한다. **현행 판매자 API별 숫자 제한·429 형식·제한 집계 단위는 이번 조사에서 확인하지 못했다.** 범용 주문 웹훅, 별도 샌드박스 주소·테스트 주문 생성도 미확인이다. ‘개발하고 테스트할 수 있다’는 홈 문구만으로 운영과 분리된 테스트 환경을 보장할 수 없다. [이용약관 제4조](https://openapi.11st.co.kr/openapi/OpenApiAgreementInfo.tmall), [센터](https://openapi.11st.co.kr/openapi/OpenApiFrontMain.tmall)

최근 공개 공지 목록에는 2026-09 점검과 2026-08-03 판매자 유형별 주소지 정책 변경 안내가 있다. 공지 본문의 세부 요건은 이번 조회에서 확보하지 못했으므로 주소 정책은 구현 착수 전 다시 확인한다. [공식 공지 목록](https://openapi.11st.co.kr/openapi/OpenApiNoticeBoard.tmall?method=getNoticeBoardList&noticeYn=Y&unityBrdNo=18)

## 7. 개인정보·데이터 저장과 통합 설계

11번가 공개 약관은 회사가 인정하는 경우 외 인증키 공유를 제한하며 제3자 동의 없는 개인정보 수집·취합을 금지한다. API 데이터 복제·저장·전송을 제한하는 포괄적인 조항도 있으므로, 다수 판매자 SaaS의 주문 원장 저장·재전송 범위는 Seller API의 별도 허용 조건과 함께 확인해야 한다. 이 문서로 저장이 전면 금지되거나 자동 허용된다고 판단하지 않는다. ESM과 11번가 모두 주문 개인정보의 정확한 제공 필드·마스킹·조회 가능 기간·앱 보유/파기 기간은 계정별 현행 계약 확인이 남아 있다. [11번가 약관 제5~7조](https://openapi.11st.co.kr/openapi/OpenApiAgreementInfo.tmall)

구현 제안:

- 내부 SKU와 ESM 마스터 상품번호, G마켓·옥션 사이트 상품번호, 11번가 상품·옵션 식별자를 대응표로 관리한다. ESM 공통 어댑터 아래에 두 채널을 두고 권한·동기화 상태는 각각 보관한다.
- 주문·주문항목·배송묶음·클레임·정산을 분리한다. 정산의 주문번호 필드명이 다르더라도 동일 내부 식별자에 연결하고 금액의 부호·귀속일을 보존한다.
- API별 요청 큐와 제한을 두고 폴링 재개 위치·중복 제거·기간 중첩 조회·정기 재대사를 구현한다. 웹훅 지원을 확인하기 전 견적은 폴링 기준으로 잡는다.
- 출고·재고·클레임 변경 시간초과 시 반영 여부를 재조회한 뒤 재시도한다. API가 공식 멱등성 키를 보장한다고 가정하지 않는다.
- 판매자별 키·주문 정보를 격리하고, 비밀키는 서버에서 보관한다. 개인정보는 필요한 최소 범위만 저장하며 로그·알림에서 마스킹하고 보유기간을 확정한다.

## 8. 현실적인 MVP와 착수 조건

아래는 조사에 따른 제안이며 확정 제품 스펙은 아니다.

| 단계 | 범위 | 검증 기준 |
| --- | --- | --- |
| 0. 접근 검증 | ESM 신청·범위·사이트 권한 확인, 11번가 키·IP·판매자 API 전문 확보 | 실제 계정으로 읽기 호출 성공, 키 관리·호출 제한·약관 조건 문서화 |
| 1. 읽기 통합 | 상품 매핑, 신규/진행 주문과 클레임 수집, 지연·오류 알림 | 판매자센터와 기간별 건수·금액 대사, 중단 후 복구 및 누락 재수집 |
| 2. 출고·재고 | 발주 확인·송장 반영, 명시한 일반/옵션 SKU 재고 동기화 | 최신 상태 재확인, 사이트별 부분 실패·중복·시간초과 검증 |
| 3. 정산 보조 | ESM 판매대금·배송비 수집 및 차이 표시, 11번가는 API 확보 후 포함 | 환불·배송비·할인·송금일 차이를 명세와 대사 |
| 이후 | 상품 등록 자동화·카테고리 확장·클레임 자동 처리·다수 판매자 서비스 | 승인 범위, 상태 전이, 개인정보·위임 조건, 운영 책임 확정 |

현재는 **ESM의 승인 불확실성과 11번가의 로그인 후 판매자 명세 확보가 일정 산정의 선행 조건**이다. 이번 조사로 구현·키 발급·운영 변경은 진행하지 않았다.
