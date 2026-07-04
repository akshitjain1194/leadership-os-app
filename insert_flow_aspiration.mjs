import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zbbusjcdfczaywhnfhos.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiYnVzamNkZmN6YXl3aG5maG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzUxNjksImV4cCI6MjA5NzcxMTE2OX0.tfsd4cMShxMonFYBQMweIIQeNq6SKnRwwacS8TyRL7I'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── STEP 0: Sign in ───────────────────────────────────────────────────────
const EMAIL = process.env.SUPA_EMAIL || 'akshitjain1194@gmail.com'
const PASSWORD = process.env.SUPA_PASSWORD
if (!PASSWORD) { console.error('Set SUPA_PASSWORD env var: SUPA_PASSWORD=yourpassword node insert_flow_aspiration.mjs'); process.exit(1) }

const { error: signInErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (signInErr) { console.error('Sign-in failed:', signInErr.message); process.exit(1) }
console.log('✓ Signed in as', EMAIL)

// ─── STEP 1: Fetch user and area ───────────────────────────────────────────
// user_profiles has user_id + person_id; name lives on the joined people row
const { data: profile, error: profErr } = await supabase
  .from('user_profiles')
  .select('user_id, person_id, person:person_id(name)')
  .eq('user_id', (await supabase.auth.getUser()).data.user.id)
  .single()

console.log('Profile:', profile, profErr)
if (!profile) { console.error('Could not load user profile:', profErr?.message); process.exit(1) }

const USER_ID = profile.user_id
const PERSON_ID = profile.person_id
console.log('USER_ID:', USER_ID, 'PERSON_ID:', PERSON_ID)

const { data: areas } = await supabase.from('areas').select('id, name').eq('user_id', USER_ID)
console.log('Areas:', areas)

const indLearning = areas.find(a => a.name.toLowerCase().includes('ind learning') || a.name.toLowerCase().includes('individual learning'))
if (!indLearning) { console.error('Could not find Ind Learning Journey area'); process.exit(1) }
const AREA_ID = indLearning.id
console.log('Area ID:', AREA_ID)

// ─── STEP 2: Insert Aspiration ─────────────────────────────────────────────
const { data: asp, error: aspErr } = await supabase.from('aspirations').insert({
  user_id: USER_ID,
  text: '100% participation and engagement in FLOW Leadership Journey',
  area_id: AREA_ID,
  horizon_years: 1,
  start_date: '2026-01-01',
  end_date: '2026-10-31',
}).select().single()

if (aspErr) { console.error('Aspiration insert error:', aspErr); process.exit(1) }
console.log('✓ Aspiration inserted:', asp.id)
const ASP_ID = asp.id

// ─── Helper ────────────────────────────────────────────────────────────────
async function insertMs({ text, horizon, due_date, parent_id }) {
  const { data, error } = await supabase.from('milestones').insert({
    user_id: USER_ID,
    aspiration_id: ASP_ID,
    parent_milestone_id: parent_id || null,
    horizon,
    text,
    due_date: due_date || null,
    anchor_person_id: PERSON_ID,
    status: 'Active',
  }).select().single()
  if (error) { console.error(`Error inserting [${horizon}] "${text}":`, error); process.exit(1) }
  console.log(`  ✓ [${horizon}] ${text.slice(0, 60)}`)
  return data.id
}

// ─── STEP 3: Annual ────────────────────────────────────────────────────────
const annualId = await insertMs({
  text: 'Complete the FLOW journey as a fully present participant — attending every session, closing the Change Challenge with Ariba by August, and walking out with documented growth in systems thinking, decision-making, and inclusion',
  horizon: 'Annual',
  due_date: '2027-03-31',
})

// ─── STEP 4: Six Month ─────────────────────────────────────────────────────
const sm1Id = await insertMs({
  text: 'Change Challenge closed — JDs rewritten, 2 social media posts live, campus orientation finalised and approved, learnings documented and shared in FLOW cohort',
  horizon: 'SixMonth',
  due_date: '2026-08-31',
  parent_id: annualId,
})

const sm2Id = await insertMs({
  text: 'FLOW journey completed — all monthly sessions attended, monthly WA reflections posted, FLOW dashboard updated consistently, and final reflection document capturing growth in systems thinking, decision-making, and inclusion shared with Meenu and Rajesh',
  horizon: 'SixMonth',
  due_date: '2026-10-31',
  parent_id: annualId,
})

// ─── STEP 5: Monthly + Weekly ──────────────────────────────────────────────

// ── JUNE ──────────────────────────────────────────────────────────────────

const mJun1 = await insertMs({
  text: 'JD for AC and Sr AC rewritten and approved with senior leadership and HR',
  horizon: 'Monthly', due_date: '2026-06-30', parent_id: sm1Id,
})
await insertMs({ text: 'Draft JD for AC role with updated language on learning, growth and youth work', horizon: 'Weekly', due_date: '2026-06-26', parent_id: mJun1 })
await insertMs({ text: 'Draft JD for Sr AC role with updated language on learning, growth and youth work', horizon: 'Weekly', due_date: '2026-06-26', parent_id: mJun1 })
await insertMs({ text: 'Share both JD drafts with senior leadership and HR for approval', horizon: 'Weekly', due_date: '2026-06-30', parent_id: mJun1 })

const mJun2 = await insertMs({
  text: 'Final online and in-person orientation design written and approved',
  horizon: 'Monthly', due_date: '2026-06-30', parent_id: sm1Id,
})
await insertMs({ text: 'Write final online orientation design incorporating Walker Cycle and session feedback', horizon: 'Weekly', due_date: '2026-06-26', parent_id: mJun2 })
await insertMs({ text: 'Write final in-person orientation design', horizon: 'Weekly', due_date: '2026-06-26', parent_id: mJun2 })
await insertMs({ text: 'Share final orientation designs with senior leadership and HR for approval', horizon: 'Weekly', due_date: '2026-06-30', parent_id: mJun2 })

const mJun3 = await insertMs({
  text: 'Monthly FLOW session attended + reflection posted on WA group + FLOW dashboard updated',
  horizon: 'Monthly', due_date: '2026-06-30', parent_id: sm2Id,
})
await insertMs({ text: 'Update FLOW dashboard (Excel)', horizon: 'Weekly', due_date: '2026-06-26', parent_id: mJun3 })
await insertMs({ text: 'Decision journal entry in Reflection Log — tag key decisions S/O/F/P', horizon: 'Weekly', due_date: '2026-06-26', parent_id: mJun3 })
await insertMs({ text: 'Attend monthly FLOW session', horizon: 'Weekly', due_date: '2026-06-30', parent_id: mJun3 })
await insertMs({ text: 'Post reflection and celebration on FLOW WA group', horizon: 'Weekly', due_date: '2026-06-30', parent_id: mJun3 })

// ── JULY ──────────────────────────────────────────────────────────────────

const mJul1 = await insertMs({
  text: '2 Instagram + 2 LinkedIn posts created and published',
  horizon: 'Monthly', due_date: '2026-07-31', parent_id: sm1Id,
})
await insertMs({ text: 'Finalise content ideas for 2 Instagram reels and 2 LinkedIn articles', horizon: 'Weekly', due_date: '2026-07-03', parent_id: mJul1 })
await insertMs({ text: 'Create Instagram reel 1 and LinkedIn article 1', horizon: 'Weekly', due_date: '2026-07-10', parent_id: mJul1 })
await insertMs({ text: 'Create Instagram reel 2 and LinkedIn article 2', horizon: 'Weekly', due_date: '2026-07-17', parent_id: mJul1 })
await insertMs({ text: 'Review and publish all 4 social media posts', horizon: 'Weekly', due_date: '2026-07-24', parent_id: mJul1 })

const mJul2 = await insertMs({
  text: 'Monthly FLOW session attended + skip meeting with Meenu held + mirrors (Ariba/Rajesh) invited into at least 1 anchored space',
  horizon: 'Monthly', due_date: '2026-07-31', parent_id: sm2Id,
})
await insertMs({ text: 'Update FLOW dashboard (Excel)', horizon: 'Weekly', due_date: '2026-07-03', parent_id: mJul2 })
await insertMs({ text: 'Decision journal entry in Reflection Log — tag key decisions S/O/F/P', horizon: 'Weekly', due_date: '2026-07-10', parent_id: mJul2 })
await insertMs({ text: 'Invite Ariba and/or Rajesh as mirror into at least 1 space you anchor this month', horizon: 'Weekly', due_date: '2026-07-17', parent_id: mJul2 })
await insertMs({ text: 'Update FLOW dashboard (Excel)', horizon: 'Weekly', due_date: '2026-07-24', parent_id: mJul2 })
await insertMs({ text: 'Attend monthly FLOW session + hold skip meeting with Meenu', horizon: 'Weekly', due_date: '2026-07-31', parent_id: mJul2 })

const mJul3 = await insertMs({
  text: 'Monthly 1:1 with Kajal held — relationship check-in documented in Reflection Log',
  horizon: 'Monthly', due_date: '2026-07-31', parent_id: sm2Id,
})
await insertMs({ text: 'Prepare for 1:1 with Kajal — reflect on relationship and what to explore', horizon: 'Weekly', due_date: '2026-07-24', parent_id: mJul3 })
await insertMs({ text: 'Hold 1:1 with Kajal and document key insight in Reflection Log', horizon: 'Weekly', due_date: '2026-07-31', parent_id: mJul3 })

// ── AUGUST ────────────────────────────────────────────────────────────────

const mAug1 = await insertMs({
  text: 'Change Challenge formally closed — learnings documented and shared in FLOW cohort',
  horizon: 'Monthly', due_date: '2026-08-31', parent_id: sm1Id,
})
await insertMs({ text: 'Compile all Change Challenge outputs — JDs, posts, orientation design', horizon: 'Weekly', due_date: '2026-08-07', parent_id: mAug1 })
await insertMs({ text: 'Document learnings from Change Challenge — accountability, feedback, leadership analysis', horizon: 'Weekly', due_date: '2026-08-14', parent_id: mAug1 })
await insertMs({ text: 'Prepare closing presentation/summary with Ariba', horizon: 'Weekly', due_date: '2026-08-21', parent_id: mAug1 })
await insertMs({ text: 'Share learnings and formally close Change Challenge in FLOW cohort', horizon: 'Weekly', due_date: '2026-08-31', parent_id: mAug1 })

const mAug2 = await insertMs({
  text: 'Monthly FLOW session attended + WA reflection posted + FLOW dashboard updated',
  horizon: 'Monthly', due_date: '2026-08-31', parent_id: sm2Id,
})
await insertMs({ text: 'Update FLOW dashboard (Excel)', horizon: 'Weekly', due_date: '2026-08-07', parent_id: mAug2 })
await insertMs({ text: 'Decision journal entry in Reflection Log — tag key decisions S/O/F/P', horizon: 'Weekly', due_date: '2026-08-14', parent_id: mAug2 })
await insertMs({ text: 'Update FLOW dashboard (Excel)', horizon: 'Weekly', due_date: '2026-08-21', parent_id: mAug2 })
await insertMs({ text: 'Attend monthly FLOW session + post reflection on FLOW WA group', horizon: 'Weekly', due_date: '2026-08-31', parent_id: mAug2 })

const mAug3 = await insertMs({
  text: 'Monthly 1:1 with Kajal held',
  horizon: 'Monthly', due_date: '2026-08-31', parent_id: sm2Id,
})
await insertMs({ text: 'Prepare for 1:1 with Kajal', horizon: 'Weekly', due_date: '2026-08-24', parent_id: mAug3 })
await insertMs({ text: 'Hold 1:1 with Kajal and document insight in Reflection Log', horizon: 'Weekly', due_date: '2026-08-31', parent_id: mAug3 })

// ── SEPTEMBER ─────────────────────────────────────────────────────────────

const mSep1 = await insertMs({
  text: 'Monthly FLOW session attended + skip meeting with Meenu held + decision journal reviewed with Rajesh (S/O/F/P clustering)',
  horizon: 'Monthly', due_date: '2026-09-30', parent_id: sm2Id,
})
await insertMs({ text: 'Update FLOW dashboard (Excel)', horizon: 'Weekly', due_date: '2026-09-04', parent_id: mSep1 })
await insertMs({ text: 'Decision journal entry in Reflection Log — tag key decisions S/O/F/P', horizon: 'Weekly', due_date: '2026-09-11', parent_id: mSep1 })
await insertMs({ text: 'Update FLOW dashboard (Excel)', horizon: 'Weekly', due_date: '2026-09-18', parent_id: mSep1 })
await insertMs({ text: 'Compile decision journal entries from past month — identify patterns across S/O/F/P', horizon: 'Weekly', due_date: '2026-09-25', parent_id: mSep1 })
await insertMs({ text: 'Attend monthly FLOW session + hold skip meeting with Meenu + review decision journal with Rajesh', horizon: 'Weekly', due_date: '2026-09-30', parent_id: mSep1 })

const mSep2 = await insertMs({
  text: 'Monthly 1:1 with Kajal held',
  horizon: 'Monthly', due_date: '2026-09-30', parent_id: sm2Id,
})
await insertMs({ text: 'Prepare for 1:1 with Kajal', horizon: 'Weekly', due_date: '2026-09-25', parent_id: mSep2 })
await insertMs({ text: 'Hold 1:1 with Kajal and document insight in Reflection Log', horizon: 'Weekly', due_date: '2026-09-30', parent_id: mSep2 })

// ── OCTOBER ───────────────────────────────────────────────────────────────

const mOct1 = await insertMs({
  text: 'Final FLOW session attended + growth reflection document completed across systems thinking, decision-making, and inclusion',
  horizon: 'Monthly', due_date: '2026-10-31', parent_id: sm2Id,
})
await insertMs({ text: 'Draft reflection on growth in systems thinking', horizon: 'Weekly', due_date: '2026-10-09', parent_id: mOct1 })
await insertMs({ text: 'Draft reflection on growth in decision-making and inclusion', horizon: 'Weekly', due_date: '2026-10-16', parent_id: mOct1 })
await insertMs({ text: 'Compile full growth reflection document and share draft with Meenu and Rajesh for input', horizon: 'Weekly', due_date: '2026-10-23', parent_id: mOct1 })
await insertMs({ text: 'Attend final FLOW session + submit final growth reflection document', horizon: 'Weekly', due_date: '2026-10-31', parent_id: mOct1 })

const mOct2 = await insertMs({
  text: 'Monthly 1:1 with Kajal held',
  horizon: 'Monthly', due_date: '2026-10-31', parent_id: sm2Id,
})
await insertMs({ text: 'Prepare for 1:1 with Kajal', horizon: 'Weekly', due_date: '2026-10-25', parent_id: mOct2 })
await insertMs({ text: 'Hold 1:1 with Kajal and document insight in Reflection Log', horizon: 'Weekly', due_date: '2026-10-31', parent_id: mOct2 })

console.log('\n✅ All done! FLOW aspiration and full milestone tree inserted successfully.')
