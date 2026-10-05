"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BUSINESS_PRESETS, getPreset, type IndustryCode, type UsageMode } from "@/lib/business";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState<IndustryCode>("b2b");
  const [usageMode, setUsageMode] = useState<UsageMode>("solo");
  const [businessName, setBusinessName] = useState("");
  const [selling, setSelling] = useState("");
  const [sources, setSources] = useState<string[]>(["Meta", "소개"]);
  const [referralId, setReferralId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const preset = useMemo(() => getPreset(industry), [industry]);

  function toggleSource(source: string) { setSources((prev) => prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]); }

  async function finish(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("로그인이 필요합니다."); setSaving(false); return; }

    let { data: member } = await supabase.from("business_members").select("business_id").eq("user_id", user.id).limit(1).maybeSingle();
    let businessId = member?.business_id as string | undefined;
    if (!businessId) {
      const { data: business, error: businessError } = await supabase.from("businesses").insert({ created_by: user.id, name: businessName.trim() || `${user.email?.split("@")[0] ?? "내"} 비즈니스` }).select("id").single();
      if (businessError) { setError(businessError.message); setSaving(false); return; }
      businessId = business.id;
      const { error: memberError } = await supabase.from("business_members").insert({ business_id: businessId, user_id: user.id, role: "owner" });
      if (memberError) { setError(memberError.message); setSaving(false); return; }
    } else {
      await supabase.from("businesses").update({ name: businessName.trim() || "내 비즈니스" }).eq("id", businessId);
    }

    const selectedSources = sources.length ? sources : preset.sourceOptions;
    const { error: settingsError } = await supabase.from("business_settings").upsert({
      business_id: businessId,
      industry,
      usage_mode: usageMode,
      business_name: businessName.trim() || null,
      selling_description: selling.trim() || null,
      product_label: preset.productLabel,
      secondary_label: preset.secondaryLabel,
      source_options: selectedSources,
      pipeline_labels: preset.pipelineLabels,
      onboarding_completed: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "business_id" });
    if (settingsError) { setError(settingsError.message); setSaving(false); return; }

    await supabase.from("customers").update({ business_id: businessId }).eq("user_id", user.id).is("business_id", null);

    if (referralId.trim()) {
      const { data: referralResult, error: referralError } = await supabase.rpc("apply_referral_code", {
        p_referred_business_id: businessId,
        p_referral_code: referralId.trim()
      });
      if (referralError) { setError(referralError.message); setSaving(false); return; }
      if (referralResult && referralResult.ok === false) { setError(referralResult.message || "지인 ID를 확인해주세요."); setSaving(false); return; }
    }

    router.replace("/"); router.refresh();
  }

  return <div className="onboarding-wrap"><div className="onboarding-card">
    <div className="brand-row center"><img className="brand-logo login-logo" src="/leadmate-icon.png" alt="LeadMate" /><div><h1>내 LeadMate 설정</h1><p>업종에 맞는 용어와 영업 흐름을 자동으로 맞춥니다.</p></div></div>
    <div className="step-indicator"><span className={step >= 1 ? "on" : ""}>1 업종</span><span className={step >= 2 ? "on" : ""}>2 사용방식</span><span className={step >= 3 ? "on" : ""}>3 영업정보</span></div>
    {step === 1 && <section><h2>어떤 영업을 하고 계신가요?</h2><div className="industry-grid">{BUSINESS_PRESETS.map((p)=><button type="button" key={p.code} className={industry===p.code?"choice-card selected":"choice-card"} onClick={()=>setIndustry(p.code)}><strong>{p.label}</strong><span>{p.productLabel} · {p.secondaryLabel}</span></button>)}</div><div className="onboarding-actions"><button className="button primary" onClick={()=>setStep(2)}>다음</button></div></section>}
    {step === 2 && <section><h2>어떻게 사용하시나요?</h2><div className="choice-row"><button type="button" className={usageMode==="solo"?"choice-card selected":"choice-card"} onClick={()=>setUsageMode("solo")}><strong>개인 영업</strong><span>나 혼자 고객과 일정을 관리합니다.</span></button><button type="button" className={usageMode==="team"?"choice-card selected":"choice-card"} onClick={()=>setUsageMode("team")}><strong>영업팀</strong><span>팀 확장을 고려해 비즈니스 단위로 시작합니다.</span></button></div><label className="onboarding-field">회사/사업명<input value={businessName} onChange={(e)=>setBusinessName(e.target.value)} placeholder="예: 봄메딕스 / OO영업팀" /></label><div className="onboarding-actions"><button className="button ghost" onClick={()=>setStep(1)}>이전</button><button className="button primary" onClick={()=>setStep(3)}>다음</button></div></section>}
    {step === 3 && <form onSubmit={finish}><h2>주로 무엇을 판매하시나요?</h2><label className="onboarding-field">상품/서비스<input value={selling} onChange={(e)=>setSelling(e.target.value)} placeholder="예: 의료기기, 자동차, 보험상품, B2B 솔루션" /></label><div className="onboarding-field"><span>주요 고객 유입경로</span><div className="source-chips">{preset.sourceOptions.map((s)=><button key={s} type="button" className={sources.includes(s)?"chip selected":"chip"} onClick={()=>toggleSource(s)}>{sources.includes(s)?"✓ ":""}{s}</button>)}</div></div><label className="onboarding-field">지인 ID <span className="muted-text">(선택)</span>
      <input value={referralId} onChange={(e)=>setReferralId(e.target.value.toUpperCase())} placeholder="지인에게 받은 추천 ID" />
    </label>
    <p className="referral-help">지인 ID를 입력하면 첫 유료 구독에서 10,000원이 할인됩니다.</p>
    <div className="preset-preview"><strong>{preset.label} 기본 영업 단계</strong><p>{Object.values(preset.pipelineLabels).join(" → ")}</p></div>{error&&<p className="notice error">{error}</p>}<div className="onboarding-actions"><button type="button" className="button ghost" onClick={()=>setStep(2)}>이전</button><button className="button primary" disabled={saving}>{saving?"설정 중...":"LeadMate 시작하기"}</button></div></form>}
  </div></div>;
}
