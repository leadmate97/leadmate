# LeadMate V2.4.2

V2.4 자동결제 기능은 유지하고, Vercel 환경변수 인식 상태를 화면에서 직접 확인할 수 있는 진단 패치입니다.

## 추가 기능
`/billing` 화면에 다음 항목이 표시됩니다.

- Toss Client Key ✓/✕
- Toss Secret Key ✓/✕
- Supabase Server Key ✓/✕
- Cron Secret ✓/✕
- Toss Key Pair ✓/✕
- Production/Preview 환경
- 테스트/라이브 키가 섞인 경우 경고
- CRON_SECRET에 Toss secret key를 잘못 넣은 경우 경고

실제 키 값은 브라우저에 노출하지 않습니다.

## 적용
Supabase 추가 SQL은 없습니다.

Vercel 환경변수를 수정한 뒤에는 반드시 새 Production Redeploy가 필요합니다.
