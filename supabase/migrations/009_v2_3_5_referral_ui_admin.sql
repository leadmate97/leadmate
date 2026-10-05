
-- LeadMate V2.3.5 admin referral credit adjustment
create or replace function public.admin_adjust_referral_credit(
  p_business_id uuid,
  p_amount_cents integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'admin only';
  end if;

  if p_amount_cents = 0 then
    return jsonb_build_object('ok', false, 'message', '조정 금액은 0원이 될 수 없습니다.');
  end if;

  insert into public.referral_credit_ledger(
    business_id, entry_type, amount_cents, status, description
  )
  values (
    p_business_id,
    case when p_amount_cents > 0 then 'adjustment' else 'reversal' end,
    p_amount_cents,
    'available',
    coalesce(nullif(trim(p_reason),''), '관리자 수동 조정')
  );

  return jsonb_build_object('ok', true, 'amount_cents', p_amount_cents);
end;
$$;

grant execute on function public.admin_adjust_referral_credit(uuid, integer, text) to authenticated;
