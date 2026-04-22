// Citizen chatter pool. Speech-bubble Easter eggs that pop over the map —
// regular citizens commenting on the state of the world, recurring in-jokes
// (the forest hermit, the heat-pump guy, the neighbor's weird compost), and
// off-topic-but-on-theme asides.
//
// Writing notes:
//   · Short. Speech bubbles dwell ~6 seconds. A quick read, not a monologue.
//   · SimCity / Plague Inc / news-sticker humor — dry, specific, human-scale.
//   · Mix reactive lines (temperature, CO₂, net zero, leading/worst country,
//     political will) with evergreen lines that don't depend on state, so
//     the bubble pool stays fresh regardless of how the run is going.
//   · Functions receive state and return string | null; return null when the
//     precondition doesn't hold and the picker will roll another.
//   · We use a shuffle-deck picker (CitizenChatterSystem) so a typical play
//     session won't see the same line twice. Keep the pool VAST.

const pick = (rng, arr) => arr[Math.floor(rng.random() * arr.length)];

const hottestCountry = (s) => {
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

const netZeroCountry = (s, rng) => {
  const list = Object.values(s.countries).filter(c => c.netZero);
  if (!list.length) return null;
  return list[Math.floor(rng.random() * list.length)];
};

// Entry shape: { text, country? }. If `country` is set, the bubble spawns over
// that country; otherwise the system picks one at random. A pool entry can be
// a string (treated as evergreen, random country) or a function (state) =>
// { text, country } | string | null.
export const CITIZEN_POOL = [
  // ─── Hermit in the forest — recurring bit. He's a whole guy.
  "My cousin swears she saw the forest hermit again. He was composting.",
  "The hermit left a note on my porch. It said 'mulch'.",
  "Someone spotted the forest hermit at the co-op buying bulk oats.",
  "The hermit built a small dam. Beavers approved.",
  "Kids in the village claim the hermit knows every tree's name.",
  "My dog ran off into the woods and came back smelling like woodsmoke and sage. Hermit territory.",
  "The hermit filed a noise complaint against a chainsaw. Via a handwritten letter. It worked.",
  "Forest ranger says the hermit files better wildlife reports than the university.",
  "Hikers left offerings at the hermit's cabin: seeds, a thermos, one AAA battery.",
  "The hermit has opinions about municipal zoning. Nobody knows how he heard about it.",
  "Local paper ran a piece on the hermit. He did not consent to the photo.",
  "The hermit released a zine. It's called 'No.' It's blank. It's very good.",

  // ─── Random cryptids, old-gods-style vibes. Early-SimCity weirdness.
  "Saw something big in the marsh last night. Probably a heron. Probably.",
  "My uncle says the bog is 'waking up'. He says that a lot.",
  "Weird lights over the reservoir. Probably drones. Probably.",
  "The lake is lower this summer. The lake has opinions about that.",
  "Someone left a tiny door at the base of an oak. It's been a week. It opens.",
  "There's a cat that follows the recycling truck. Different cat each week. Same look.",
  "Neighbor swears the wind turbine hums her name. She lives three towns over.",
  "Teen on the bus said the clouds are 'scripted today'. He wasn't wrong.",

  // ─── The Heat Pump Guy. Everybody has one.
  "My neighbor got a heat pump. Will not stop talking about it.",
  "The heat pump guy is at the door. Again. With a pamphlet.",
  "Brother-in-law installed a heat pump and now he's 'an installer'.",
  "My landlord finally replaced the boiler. Cried a little when the bill came in under.",
  "Our heat pump is named Gertrude. She is a good machine.",

  // ─── Weather-as-small-talk, pitched toward climate anxiety.
  "It's too warm for this time of year. Again. Still.",
  "Snowdrops bloomed in January. Not cute anymore.",
  "The cherries flowered two weeks early. The bees missed them.",
  "Summer used to have a shape. Now it's just a long squint.",
  "The rain doesn't come right. It either skips town or drowns it.",
  "We got a new word for the wind this year. It's not a nice word.",
  "Grandma calls every heat wave 'the big one' now. She's often right.",
  "I bought a second fan. My landlord has feelings about the breaker.",

  // ─── Office/urban chatter.
  "The office thermostat war has entered year nine.",
  "New guy brought his bike into the elevator. We respect new guy.",
  "IT replaced the server room AC. Now the plants are thriving.",
  "Our building got solar. The roof gang is unionizing.",
  "City put a bike lane outside the deli. The deli loves it.",
  "They repainted the crosswalk and traffic slowed by itself.",
  "There's a rooftop farm now. I work two floors below tomatoes.",
  "Parking lot across the street became a park. I cried on a Tuesday.",

  // ─── Kids / school / earnest idealism.
  "My kid is seven and just asked what 'drilling' is. I froze.",
  "Science fair winner this year: a worm that eats styrofoam.",
  "Middle-schoolers organized the town's first compost drive. Adults showed up.",
  "My daughter wrote a letter to a senator. The senator wrote back.",
  "The class hamster has a solar wheel. They did this themselves.",
  "Kindergarteners renamed the school 'The Biosphere'. Principal allowed it.",
  "High-schoolers are suing a refinery. Refinery is losing.",

  // ─── Food / farming / culinary.
  "I grew a tomato. One. Felt like winning a lottery.",
  "Our grocery now labels produce by miles. I'm lightly ashamed of a mango.",
  "Farmer's market doubled in size. Mushroom guy brought a cargo bike.",
  "The butcher started carrying lab steak. 'Same blood, different cow,' he said.",
  "I eat beans now. I am a bean person.",
  "Local bread has doubled. We still buy it. It's the bread.",
  "Guy at the diner ordered 'the regular'. The cook served him a salad. He approved.",

  // ─── Media / culture / brand satire.
  "New oil-company ad. A very sad tree. Not working on me.",
  "TV had another 'balanced debate' between a scientist and a man in a tie.",
  "Ad said 'carbon neutral' in a font that means nothing.",
  "A streaming show about climate. The villain is a spreadsheet.",
  "The cereal box has a QR code that leads to a PDF. I read the PDF.",
  "Every appliance is 'smart' now except the one I need to be smart.",
  "Billboard says 'WE LISTEN'. We do not think they listen.",
  "Brand rebranded. Logo is greener. Factory is the same.",

  // ─── Workplace/economic anxiety + absurdity.
  "My pension fund sent a letter. It had the word 'stranded' in it.",
  "Our CEO did a sustainability TED talk. The slides were from 2019.",
  "HR added a 'climate grief' chat channel. It's very active.",
  "The insurance company sent a drone to look at my roof. I waved.",
  "My bank has a climate score now. I did not opt in.",
  "Got a raise. Gas went up more. Net: a pigeon.",

  // ─── Transit / mobility.
  "Bus driver waved at me today. I waved back. The system works.",
  "Ferry's electric now. Still smells like ferry.",
  "They put a charger at the old gas station. Same gum in the machines.",
  "E-bike got stolen. E-bike got returned. Small town.",
  "Taxi driver explained carbon pricing better than the newscaster.",

  // ─── Nature returning bits.
  "Saw a pangolin on a nature cam feed. I had been waiting.",
  "Wolves came back to the valley. The deer are being polite.",
  "A beaver built a thing. The county is furious. The wetland is thrilled.",
  "The salmon made it up the ladder. We cheered like it was the World Cup.",
  "Fireflies came back. A child asked what they were.",
  "Heard a frog chorus for the first time in a decade. Did not move.",

  // ─── Conspiracies (gentle, absurdist — not actually conspiratorial).
  "Pretty sure my utility is flirting with me via notifications.",
  "Somebody's replacing the billboards at night. They're just… nicer.",
  "The city planted trees while I was on vacation. I feel watched.",
  "Every recycling bin on this block has a tiny sticker. Can't read it.",
  "I think the pigeons are organized. Don't look up.",

  // ─── Denial/satire — the last gasps. Punch up.
  "My uncle forwarded another 'snow = no climate change' meme. It's July.",
  "Dad said wind turbines cause cancer. Dad has 40 screens.",
  "Somebody's letter to the editor argued carbon is a plant. That was the argument.",
  "Talk radio host banned heat pumps on air. His listeners just installed one.",
  "Think-tank paper reads like it was written by a kerosene lamp.",

  // ─── Pure flavor — short human moments.
  "It's a good morning to be outside. Remembered why we do this.",
  "The park benches are warm. In a nice way.",
  "Library added a tool library. I borrowed a drill. I'll return it.",
  "Block party on Saturday. Somebody's bringing a solar boom box.",
  "Town meeting ran long but we agreed on a thing. Rare.",
  "Coffee shop composts now. The coffee tastes the same. Shocking nobody.",
  "Ran into an old friend at the seed swap. We're both tomato people now.",

  // ─── Institutional / political (state-agnostic).
  "Parliament broadcast was actually watchable today. The minister answered the question.",
  "Central banker used the phrase 'physical risk' without flinching.",
  "Court ruled a permit void. Judge cited a polar bear. It was not a metaphor.",
  "A minister resigned. The internet held a small parade.",
  "Oil lobbyist asked politely to be called something else. Denied.",

  // ─── Meta-gamey, 4th-wall-ish (sparingly).
  "Somewhere, someone is making big decisions about my town. I wish them well.",
  "Feels like there's a scoreboard I can't see.",
  "I don't know who's in charge of all this. I hope they're paying attention.",

  // ─── State-reactive: Temperature ─────────────────────────────────────────
  (s) => s.world.tempAnomalyC > 2.6
    ? "The air tastes like pennies today. Locked the dog inside."
    : null,
  (s) => s.world.tempAnomalyC > 2.4
    ? "Third heat dome this year. We know the drill now. We shouldn't."
    : null,
  (s) => s.world.tempAnomalyC > 2.2
    ? "The river hit 30°C. The trout are at the bottom, waiting."
    : null,
  (s) => s.world.tempAnomalyC > 2.0
    ? "Power went out at 2pm. Grid's 'priority-shedding,' they call it."
    : null,
  (s) => s.world.tempAnomalyC > 1.85
    ? "My city declared a 'cooling center'. My city has cooling centers now."
    : null,
  (s) => s.world.tempAnomalyC > 1.7
    ? "I moved my tomatoes into the shade. They're from tomatoes now, not me."
    : null,
  (s) => (s.world.tempAnomalyC < 1.4 && s.meta.tick > 40)
    ? "Heard a cicada I hadn't heard since I was a kid. Thought that was gone."
    : null,
  (s) => (s.world.tempAnomalyC < 1.25 && s.meta.tick > 60)
    ? "The creek's cold again. The cold is back in the creek."
    : null,

  // ─── State-reactive: CO₂ ─────────────────────────────────────────────────
  (s) => s.world.co2ppm > 445
    ? "My uncle says we should just 'tough it out'. My uncle is on a ventilator."
    : null,
  (s) => s.world.co2ppm > 435
    ? "The scientists are on TV again. They look tired. We look tired."
    : null,
  (s) => (s.world.co2ppm < 410)
    ? "They said the number went down. Everyone hugged at the pub. I don't understand it but I hugged."
    : null,
  (s) => (s.world.co2ppm < 400 && s.meta.tick > 60)
    ? "Mauna Loa livestream had like a million viewers. It's just a graph. It's the graph."
    : null,

  // ─── State-reactive: Political Will ──────────────────────────────────────
  (s) => {
    let low = null;
    for (const c of Object.values(s.countries)) {
      if ((c.politicalWill ?? 50) < 22 && (!low || c.politicalWill < low.politicalWill)) low = c;
    }
    if (!low) return null;
    const rng = s.meta.rng;
    const text = pick(rng, [
      `My cousin in ${low.name} says the protests are the loudest he's ever heard.`,
      `Friend in ${low.name} couldn't get to work — streets shut down again.`,
      `They're marching in ${low.name}. We're watching the feed.`,
    ]);
    return { text, country: low };
  },
  (s) => {
    let high = null;
    for (const c of Object.values(s.countries)) {
      if ((c.politicalWill ?? 50) > 82 && (!high || c.politicalWill > high.politicalWill)) high = c;
    }
    if (!high) return null;
    const rng = s.meta.rng;
    const text = pick(rng, [
      `My aunt in ${high.name} says the vote went through. She sent me a photo of a smile.`,
      `Over in ${high.name} they actually did the thing. The whole thing.`,
      `They got the bill through in ${high.name}. My chat group went feral with emojis.`,
    ]);
    return { text, country: high };
  },

  // ─── State-reactive: worst current emitter ───────────────────────────────
  (s) => {
    const c = hottestCountry(s);
    if (!c || (c.baseEmissionsGtCO2 ?? 0) < 1.5) return null;
    const rng = s.meta.rng;
    const text = pick(rng, [
      `Smokestacks still going in ${c.name}. My grandma points at them every morning.`,
      `Read the minister's speech from ${c.name}. Read it twice. Still said nothing.`,
      `Cousin works at a refinery in ${c.name}. Says morale is 'weird'.`,
      `Another 'study' out of ${c.name}. Paid for by the guys with the pipes.`,
    ]);
    return { text, country: c };
  },

  // ─── State-reactive: leading country ─────────────────────────────────────
  (s) => {
    const c = leadingCountry(s);
    if (!c) return null;
    const lead = Object.values(c.adoption).reduce((a, b) => a + b, 0) / 6;
    if (lead < 0.45) return null;
    const rng = s.meta.rng;
    const text = pick(rng, [
      `Delegation visiting from ${c.name}. They have a clipboard. They have plans.`,
      `My brother moved to ${c.name} for the grid job. He sounds happy. Bastard.`,
      `They finished the transition in ${c.name}. The lights stayed on. Huh.`,
      `Pen pal in ${c.name} says the air smells different. In a good way.`,
    ]);
    return { text, country: c };
  },

  // ─── State-reactive: Net Zero moments ────────────────────────────────────
  (s) => {
    const c = netZeroCountry(s, s.meta.rng);
    if (!c) return null;
    const rng = s.meta.rng;
    const text = pick(rng, [
      `My niece just moved to ${c.name}. She says the skies are stupid blue.`,
      `They had a parade in ${c.name}. A parade! For a number!`,
      `${c.name} hit zero. Felt it on the news. Something in the chest.`,
    ]);
    return { text, country: c };
  },

  // ─── State-reactive: societal stress ─────────────────────────────────────
  (s) => (s.world.societalStress ?? 0) > 0.55
    ? "Neighbor took in a family from down-coast. Said they'd do the same."
    : null,
  (s) => (s.world.societalStress ?? 0) > 0.4
    ? "Food bank line wrapped the block. We all knew each other."
    : null,

  // ─── State-reactive: cost / resources ────────────────────────────────────
  (s) => (s.world.climatePoints ?? 0) < 10
    ? "Council said the climate budget's tight. They said it with their whole face."
    : null,

  // ─── State-reactive: time late-game ──────────────────────────────────────
  (s) => s.meta.year >= 2045
    ? `It's ${s.meta.year} and I can finally tell my grandkids what 'emissions' meant.`
    : null,
  (s) => s.meta.year >= 2055
    ? `Showed my kid an old photo of a highway. He asked why it was so wide.`
    : null,

  // ─── State-reactive: seasonal ────────────────────────────────────────────
  (s) => s.meta.quarter === 4
    ? "Neighbors doing a low-light-string Christmas this year. Looks better, honestly."
    : null,
  (s) => s.meta.quarter === 2
    ? "Somebody planted wildflowers in the traffic median. Nobody mowed them. Good."
    : null,
  (s) => s.meta.quarter === 3
    ? "Summer's cooked. We're doing movie nights in the library basement."
    : null,

  // ─── Country-random flavor (spawns near a random country) ────────────────
  (s) => {
    const rng = s.meta.rng;
    const c = randomCountry(s, rng);
    if (!c) return null;
    const text = pick(rng, [
      `My auntie in ${c.name} finally got rooftop solar. She texts me every sunny day.`,
      `Cousin in ${c.name} says the new bus line goes right to her door.`,
      `Friend of mine in ${c.name} quit oil, took a job in grid balancing. Sleeps better.`,
      `Pen pal in ${c.name} sent pressed flowers from a restored meadow.`,
      `Somebody's grandma in ${c.name} out-composted the municipal program.`,
      `A wedding in ${c.name} was fully vegetarian. Nobody noticed.`,
      `A school in ${c.name} painted the roof white. Classrooms dropped 6°C.`,
      `Kid in ${c.name} won a contest naming a new ferry. Named it 'Slow Boat'.`,
      `In ${c.name}, they put a thermometer on every town hall. Mine reads honesty.`,
      `Someone in ${c.name} convinced the mayor to turn the cul-de-sac into a garden.`,
    ]);
    return { text, country: c };
  },
  (s) => {
    const rng = s.meta.rng;
    const c = randomCountry(s, rng);
    if (!c) return null;
    const text = pick(rng, [
      `Ran into a scientist from ${c.name} at the market. She was buying leeks.`,
      `Exchange student from ${c.name} taught our class three words for 'rain'.`,
      `Weather in ${c.name} is apparently 'doing a thing'. It's always doing a thing.`,
      `My brother's band played ${c.name} last tour. They took the train.`,
      `${c.name} posted a national tree count. It was oddly moving.`,
    ]);
    return { text, country: c };
  },
];
