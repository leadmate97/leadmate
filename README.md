# LeadMate V2.4

## 핵심 변경
- Toss Payments 자동결제(빌링) 카드 등록
- 빌링키 서버 저장
- 7일 무료체험 종료 후 월 자동결제 기반
- 개인형 39,000원 / 팀·사업장형 159,000원
- 신규 추천자 첫 결제 10,000원 할인
- 기존 추천인의 누적 크레딧을 결제 전에 자동 차감
- 크레딧 초과분 다음 달 이월
- 결제 성공/실패 상태 기록
- 기간 종료 후 자동결제 해지
- Vercel Cron으로 매일 결제 대상 확인

## 이번에 Supabase에서 실행할 SQL
기존 001~009를 다시 실행하지 말고:
`supabase/migrations/010_v2_4_toss_recurring_billing.sql`

## Vercel 환경변수
기존 Supabase 2개 외에 아래를 추가합니다.

### Config
`NEXT_PUBLIC_TOSS_CLIENT_KEY`

### Secret
`SUPABASE_SERVICE_ROLE_KEY`
`TOSS_SECRET_KEY`
`CRON_SECRET`

주의:
- `TOSS_SECRET_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`는 절대 NEXT_PUBLIC_ 접두사를 붙이지 않습니다.
- GitHub에 실제 키를 넣지 않습니다.
- 토스페이먼츠 자동결제는 테스트 키로 먼저 검증하세요.
- 실제 운영 자동결제는 토스페이먼츠의 자동결제 계약/심사가 필요합니다.

## 결제 흐름
1. 사용자가 요금제를 선택
2. `자동결제 카드 등록`
3. Toss 결제창에서 카드 인증
4. 서버에서 authKey로 billingKey 발급
5. billingKey는 서버 전용 테이블에 저장
6. 무료체험 종료일에 Cron이 결제
7. 추천 첫 결제 할인/누적 크레딧 차감
8. 결제 성공 시 다음 결제일을 1개월 후로 설정
9. 실패 시 past_due 상태 및 실패 이력 기록

## 테스트
환경변수 입력 후:
`npm install`
`npm run build`
`npm run dev`

결제페이지 `/billing`에서 테스트 카드 등록을 진행합니다.
