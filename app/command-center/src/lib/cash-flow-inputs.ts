// Required by the existing projection, not new accounting assumptions.
export const requiredForecastAssumptions = ['fixed_overhead_monthly','undated_collection_pct','new_billings_ramp_week','new_billings_weekly','payroll_per_run','one_time_outflow_week1','materials_weekly','subs_weekly','commissions_weekly','min_cash_floor'] as const;
export function isFinancialNumber(value: unknown): boolean {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
}
function isDate(value:unknown):boolean {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function cashFlowInputError(input: {assumptions:unknown;cash:unknown;dated:unknown;undated:unknown;topJobs:unknown}): string | null {
  const {assumptions,cash,dated,undated,topJobs}=input;
  if(!Array.isArray(cash) || cash.length===0 || cash.some(r=>!r || !isFinancialNumber(r.balance))) return 'Bank balances are missing or invalid.';
  if(!Array.isArray(assumptions) || assumptions.some(r=>!r || !isFinancialNumber(r.value) || !isFinancialNumber(r.min_value) || !isFinancialNumber(r.max_value) || Number(r.min_value)>Number(r.max_value) || Number(r.value)<Number(r.min_value) || Number(r.value)>Number(r.max_value))) return 'Forecast assumptions are missing or invalid.';
  for(const key of requiredForecastAssumptions) if(assumptions.filter(r=>r.key===key).length!==1) return 'Required forecast assumptions are missing or duplicated.';
  if(!Array.isArray(dated) || dated.some(r=>!r || !isDate(r.week_start) || typeof r.past_expected!=='boolean' || !isFinancialNumber(r.expected_cash) || Number(r.expected_cash)<=0 || !isFinancialNumber(r.jobs) || !Number.isInteger(Number(r.jobs)) || Number(r.jobs)<=0)) return 'Dated receipt inputs are missing or invalid.';
  if(!undated || typeof undated!=='object') return 'Undated receipt totals are unavailable.';
  const u=undated as Record<string,unknown>;
  if(!isFinancialNumber(u.jobs) || !Number.isInteger(Number(u.jobs)) || Number(u.jobs)<0) return 'Undated receipt counts are invalid.';
  // SQL COUNT=0 with SUM=NULL is a known empty set; a missing row is not.
  if(!(Number(u.jobs)===0 && u.expected_cash===null) && !isFinancialNumber(u.expected_cash)) return 'Undated receipt values are unavailable.';
  if(Number(u.jobs)===0 ? (u.expected_cash!==null && Number(u.expected_cash)!==0) : Number(u.expected_cash)<=0) return 'Undated receipt totals contradict the population.';
  // Filtered SUM is NULL when there are no insurance rows, even with retail jobs.
  if(u.insurance_cash!==null && !isFinancialNumber(u.insurance_cash)) return 'Insurance receipt values are invalid.';
  if(u.insurance_cash!==null && (Number(u.insurance_cash)<0 || Number(u.insurance_cash)>Number(u.expected_cash))) return 'Insurance receipt totals contradict the population.';
  if(!Array.isArray(topJobs) || topJobs.some(r=>!r || !isFinancialNumber(r.expected_cash_amount ?? r.outstanding_ar))) return 'AR detail values are missing or invalid.';
  return null;
}
