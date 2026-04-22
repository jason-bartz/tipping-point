// News ticker pool. Strings are plain flavor. Functions receive state and can
// return contextual headlines based on what's actually happening — they are
// expected to return `null` when their precondition doesn't hold, in which
// case the picker just rolls another.
//
// Writing notes:
//   · Headlines are short — the ticker crawls in ~6 seconds, so the eye has
//     to catch the joke or the specific in one pass.
//   · Prefer specificity: named institutions, named countries, dates, ppm
//     values. Generic "oil industry" lines age fast.
//   · Mix tones: satire, straight news, absurdity, human-scale color. Keep
//     ratio ~60/20/10/10 so the ticker doesn't feel all one note.

const pick = (rng, arr) => arr[Math.floor(rng.random() * arr.length)];

const hottestCountry = (s) => {
  // Highest baseline emitter that's still above 50% dirty.
  let best = null, bestScore = -Infinity;
  for (const c of Object.values(s.countries)) {
    const dirty = 1 - Object.values(c.adoption).reduce((a, b) => a + b, 0) / 6;
    const score = (c.baseEmissionsGtCO2 ?? 0) * dirty;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
};

const leadingCountry = (s) => {
  let best = null, bestAdopt = -1;
  for (const c of Object.values(s.countries)) {
    const adopt = Object.values(c.adoption).reduce((a, b) => a + b, 0) / 6;
    if (adopt > bestAdopt) { bestAdopt = adopt; best = c; }
  }
  return best;
};

const randomCountry = (s, rng) => {
  const list = Object.values(s.countries);
  return list[Math.floor(rng.random() * list.length)];
};

export const NEWS_POOL = [
  // ─── Static satire — evergreen jokes that don't age with the sim state.
  "Norway goes 100% EV. Remaining oil exports 'for the rest of you'.",
  "Saudi Arabia unveils 'Green Oil'. Scientists squint.",
  "Germany reinvents the bicycle, brands it Fahrrad 2.0.",
  "TikTok trend #HeatPumpDance credited with 40% adoption spike.",
  "COP-47 delegates arrive in electric private jets.",
  "Exxon pivots to 'energy solutions'. Stock up 30%.",
  "China installs more solar in a week than France has in total.",
  "Billionaire launches Inspect-the-Climate rocket. Emits 40kt CO₂.",
  "Scientists confirm trees still absorb carbon. 847-page paper.",
  "Oil CEO tearfully admits 'we knew'. Asks for bailout.",
  "Beavers hired by government, exceed every KPI.",
  "Solar farm fails to impress cat. Cat still naps on it.",
  "Lobbyist caught rebranding as 'Chief Stakeholder Officer'.",
  "COP delegates debate meaning of word 'shall'. Enter day 14.",
  "Heat pump installer becomes nation's most-requested profession.",
  "Airline introduces 'optional emissions'. Unclear what that means.",
  "Small nuclear reactor approved. Local moose thriving.",
  "Mayor replaces six-lane highway with park. Commute times drop.",
  "Carbon price doubled overnight. Emissions drop, yachts unaffected.",
  "Denmark runs on wind for entire month. Asks if anyone noticed.",
  "Insurance industry: 'OK now we're worried.'",
  "Regenerative farm outperforms chemical one. Farmers take notes.",
  "Hydrogen hub accidentally splits water, exactly as planned.",
  "Fossil fuel subsidy cut. Finance minister visibly taller.",
  "Oil CEO tries steak made of air. Describes it as 'not bad'.",
  "Electric aviation prototype flies. Pilot forgets to turn off AC.",
  "Supreme Court rules climate 'a thing'. 5-4 decision.",
  "Youth strike now daily. Schools add climate to curriculum, finally.",
  "Petrostate announces 'Vision 2075'. Observers note date.",
  "Mangrove restoration exceeds targets. Mangroves unavailable for comment.",
  "Cement industry invents cement without cement. Patent pending.",
  "Cargo ship sets sail. Literally. First wind-powered freight in a century.",
  "Crypto miner converts to heat pumps. Honest work, for once.",
  "Climate skeptic hedge fund announces climate strategy. Unclear how.",
  "Central bank adds 'climate stress' to capital rules. Bankers blink.",
  "Amazon basin reforestation app goes viral. 12M trees pledged in a week.",
  "Retired oilfield turned geothermal plant. Same pipes, different fluid.",
  "Big Beef quietly invests in lab-grown. Confidential internal memo leaks.",
  "Net-zero airport. Pilot's lounge still has lounge chairs that aren't.",
  "Vatican issues climate encyclical. Sequel hinted at.",
  "Teachers union demands climate lessons at primary level. Wins.",
  "Climate litigation firm sues a subsidy. Judge intrigued.",
  "E-bike outsells sedan for third straight quarter. Dealers adapt.",
  "Reinsurer refuses to cover new coastal builds. Market follows.",
  "Data center co-located with district heat network. Neighborhood warm, bills lower.",
  "Electric ferry line launched. Gulls unaffected.",
  "New IPCC summary slimmer than last. 'Less waffle, more action.'",
  "Carbon accounting firm goes public. Opens at 38, closes at 19.",
  "Old coal plant hosts wedding. Chimney not in frame.",
  "Labor minister tours training center for grid technicians. Smiles.",
  "Soccer team announces 100% renewable stadium. Rivals jeer, then copy.",
  "City bans gas hookups on new builds. Plumber guild rebrands.",

  // ─── Temperature-coupled lines.
  (s) => s.world.tempAnomalyC > 2.4 ? "Heat-dome deaths hit record. Morgues requisition ice trucks." : null,
  (s) => s.world.tempAnomalyC > 2.1 ? "Crop belts shift 400km north. Old farmers, new vines." : null,
  (s) => s.world.tempAnomalyC > 1.9 ? "Arctic ice season shortens again. Polar bears lawyer up." : null,
  (s) => s.world.tempAnomalyC > 1.7 ? "Coral bleaching event hits 80% of reef monitoring sites." : null,
  (s) => s.world.tempAnomalyC < 1.5 && s.meta.tick > 40 ? "Temperature trend reverses. Cautious optimism detected." : null,
  (s) => s.world.tempAnomalyC < 1.3 && s.meta.tick > 60 ? "1.3°C ceiling holds. Climatologists permit themselves a cautious grin." : null,

  // ─── CO₂-coupled lines, including milestone crossings.
  (s) => s.world.co2ppm > 445 ? "CO₂ punches through 445 ppm. UN calls emergency session, everyone says 'we knew'." : null,
  (s) => s.world.co2ppm > 430 && s.world.co2ppm < 445 ? "CO₂ past 430 ppm. Historians already drafting the chapter title." : null,
  (s) => s.world.co2ppm < 410 ? "CO₂ readings dip below 410 ppm. Mauna Loa staff high-five." : null,
  (s) => s.world.co2ppm < 400 && s.meta.tick > 60 ? "Below 400 ppm. First time since the 2010s. Crowds gather at Mauna Loa webcam." : null,

  // ─── Net Zero count lines.
  (s) => {
    const nz = Object.values(s.countries).filter(c => c.netZero).length;
    if (nz === 0) return null;
    if (nz === 1) return null; // covered by the NET_ZERO event handler
    if (nz === 2) return "Two countries at Net Zero. The club exists.";
    if (nz === 3) return "Three at Net Zero. Rivalry talk intensifies.";
    if (nz >= 5 && nz < 8) return `${nz} nations at Net Zero. Laggards schedule emergency strategy retreats.`;
    if (nz >= 8) return `${nz} at Net Zero. Holdouts floated an exit-from-emissions treaty. It's not funny anymore.`;
    return null;
  },

  // ─── Economic state lines.
  (s) => s.world.climatePoints > 120 ? "Climate ministries flush with funds. Contractor-scam attempts spike." : null,
  (s) => s.world.climatePoints < 15 ? "Climate fund running thin. Treasurer writes stern memo." : null,

  // ─── Hottest-emitter callouts — names the actual worst country this tick.
  (s) => {
    const c = hottestCountry(s);
    if (!c || (c.baseEmissionsGtCO2 ?? 0) < 1.5) return null;
    const rng = s.meta.rng;
    return pick(rng, [
      `${c.name} emissions still rising. Government blames a spreadsheet.`,
      `Flight from ${c.name} to Davos: 11 private jets, one climate panel.`,
      `${c.name}'s fossil lobby launches 'nuance' ad campaign. Viewers unmoved.`,
      `Journalists in ${c.name} name the refineries. Shareholders hide.`,
      `${c.name}'s coal caucus introduces bill titled "Reality Deferral Act".`,
    ]);
  },

  // ─── Leading-country callouts — names the actual best country this tick.
  (s) => {
    const c = leadingCountry(s);
    if (!c) return null;
    const rng = s.meta.rng;
    const lead = (Object.values(c.adoption).reduce((a, b) => a + b, 0) / 6);
    if (lead < 0.4) return null;
    return pick(rng, [
      `${c.name} hits ${Math.round(lead * 100)}% cross-sector adoption. Textbooks add a chapter.`,
      `Delegations from six nations visit ${c.name} to copy the playbook.`,
      `${c.name}'s energy minister asked for the millionth time, 'how'? Shrugs politely.`,
      `Kids in ${c.name} don't know a world without a carbon price. School board confirms.`,
      `${c.name} quietly decommissions its last coal plant. Workers already retrained.`,
    ]);
  },

  // ─── Random-country color — mundane, grounded moments.
  (s) => {
    const rng = s.meta.rng;
    if (rng.random() > 0.5) return null;
    const c = randomCountry(s, rng);
    if (!c) return null;
    return pick(rng, [
      `${c.name} adds bike lanes to a single street. Everyone uses them.`,
      `A town council in ${c.name} installs its first heat pump. Local paper covers it.`,
      `High-school science fair in ${c.name} judged by a climate economist. First prize: peat bog restoration model.`,
      `${c.name}'s pension fund divests. Portfolio returns improve.`,
      `Weather presenter in ${c.name} breaks character mid-broadcast: "This isn't weather. This is a pattern."`,
      `A farmer in ${c.name} plants cover crops for the first time. Yields hold.`,
      `${c.name} launches a citizens' assembly on climate policy. Recommendations exceed the minister's draft.`,
    ]);
  },

  // ─── Political-will callouts — draws attention to an outlier country.
  (s) => {
    let low = null;
    for (const c of Object.values(s.countries)) {
      if ((c.politicalWill ?? 50) < 22 && (!low || c.politicalWill < low.politicalWill)) low = c;
    }
    if (!low) return null;
    const rng = s.meta.rng;
    return pick(rng, [
      `Protests in ${low.name} block climate bill. Energy companies quietly applaud.`,
      `${low.name}'s government walks back carbon price after 48 hours of pressure.`,
      `Polling in ${low.name}: voters support 'climate action' at 61%; specific policies, 24%.`,
    ]);
  },
  (s) => {
    let high = null;
    for (const c of Object.values(s.countries)) {
      if ((c.politicalWill ?? 50) > 82 && (!high || c.politicalWill > high.politicalWill)) high = c;
    }
    if (!high) return null;
    const rng = s.meta.rng;
    return pick(rng, [
      `${high.name}'s climate bill clears on a 3-to-1 vote. Opposition files a friendly amendment.`,
      `${high.name}'s green industry stocks up on overtime. Hiring signs in three languages.`,
      `Voter turnout in ${high.name} climate referendum hits 78%. Passes decisively.`,
    ]);
  },

  // ─── Societal stress.
  (s) => (s.world.societalStress ?? 0) > 0.6 ? "Humanitarian corridors strained. NGOs ask donors to double pledges." : null,
  (s) => (s.world.societalStress ?? 0) > 0.45 ? "Migration flows redraw city plans. Planners open windows, listen." : null,

  // ─── Time-based color — late-game inflections.
  (s) => s.meta.year >= 2040 && s.meta.year < 2050 ? `It's ${s.meta.year}. Under-30s don't remember a pre-climate politics.` : null,
  (s) => s.meta.year >= 2050 ? `${s.meta.year}: the climate bills of 2030 now read like common sense. Historians note the lag.` : null,

  // ─── Seasonal — Santa switches to biochar. Q4 only, so the joke lands when
  // the northern hemisphere is actually staring down a chimney.
  (s) => s.meta.quarter === 4
    ? "Santa switches from coal to biochar. Naughty list reviewers note the upgrade is 'carbon-negative, too.'"
    : null,

  // His Majesty the King flies carbon neutral (evergreen; the palace PR is always on).
  "His Majesty the King's state visit logs net-zero flight emissions. Republicans note the precedent; monarchists note the math.",
];
