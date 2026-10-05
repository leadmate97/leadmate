# LeadMate V2.4.3

카드 등록 버튼을 눌러도 토스 자동결제 등록창이 열리지 않는 상황을 진단하기 위한 패치입니다.

## 추가 진단 단계
`/billing`의 `카드 등록 진단` 영역에서 다음 흐름을 순서대로 확인합니다.

1. 카드 등록 버튼 클릭
2. Toss JavaScript SDK 로딩 여부
3. `/api/billing/setup` 서버 호출
4. clientKey / customerKey / successUrl / failUrl 확인
5. `TossPayments(clientKey)` 초기화
6. `payment({ customerKey })` 생성
7. `requestBillingAuth()` 실행
8. 발생한 오류 코드와 메시지 표시

실제 Client/Secret 키 값은 화면에 노출하지 않습니다.

## Supabase
추가 SQL 없음.

## 적용
ZIP 내용을 기존 LeadMate 폴더에 덮어쓰고:
- npm install
- npm run build
- git add/commit/push

Vercel 배포 완료 후 `/billing`에서 `카드 등록` 버튼을 누르고
`카드 등록 진단`에 표시되는 마지막 단계와 오류 코드를 확인합니다.
