/*
 * Matchup Stakes and Predictions.
 *
 * A contest market stores participation and locked financial terms. The
 * official draw and bracket remain the only source of contest truth, and every
 * settlement value is derived from the current winner. No paid/settled flag is
 * written, so retries and result corrections cannot append another payment.
 */

const CONTEST_MARKET_KIND = "bracket-match";
const MARKET_CHIP = 100;

const cleanInt = value => Number.isInteger(Number(value)) ? Number(value) : null;
const cleanSideKey = value => String(value);
const blankDeltas = () => ({});
const addDelta = (deltas, player, delta) => {
  if (!player || !delta) return;
  deltas[player] = (deltas[player] || 0) + delta;
  if (!deltas[player]) delete deltas[player];
};
const sumDeltas = deltas =>
  Object.values(deltas || {}).reduce((sum, value) => sum + Number(value || 0), 0);
const mergeDeltas = (...maps) => {
  const deltas = blankDeltas();
  maps.forEach(map => Object.entries(map || {}).forEach(([player, delta]) =>
    addDelta(deltas, player, delta)));
  return deltas;
};
const resolveBracketSlot = (bracket, slot) => {
  if (!slot) return null;
  if (slot.t !== undefined) return slot.t;
  const source = bracket?.rounds?.[slot.w?.[0]]?.[slot.w?.[1]];
  return source && source.winner !== null && source.winner !== undefined
    ? source.winner : null;
};
const validStake = value => Number.isInteger(value)
  && value >= MARKET_CHIP
  && value % MARKET_CHIP === 0;
const samePlayers = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length
  && [...left].sort().every((player, index) => player === [...right].sort()[index]);

function bracketMatchContext(state, market) {
  if (!market || market.kind !== CONTEST_MARKET_KIND)
    return { valid:false, reason:"Unsupported contest market" };
  const draw = state.draws?.[market.eventId];
  if (!draw || draw.id !== market.drawId)
    return { valid:false, reason:"The matchup draw changed" };
  const bracket = state.brackets?.[market.eventId];
  const round = cleanInt(market.round);
  const matchIndex = cleanInt(market.match);
  const match = bracket?.rounds?.[round]?.[matchIndex];
  if (!match) return { valid:false, reason:"The matchup no longer exists" };

  const teamIndexes = [
    resolveBracketSlot(bracket, match.a),
    resolveBracketSlot(bracket, match.b),
  ];
  if (teamIndexes.some(teamIndex => teamIndex === null || !draw.teams?.[teamIndex]))
    return { valid:false, reason:"The matchup is not fully seated" };
  const sides = teamIndexes.map(teamIndex => ({
    key:cleanSideKey(teamIndex),
    teamIdx:teamIndex,
    players:[...draw.teams[teamIndex].players],
  }));
  const storedSides = Array.isArray(market.sides) ? market.sides : [];
  if (storedSides.length !== sides.length || sides.some(side => {
    const stored = storedSides.find(item => cleanSideKey(item?.key) === side.key);
    return !stored || !samePlayers(stored.players, side.players);
  })) return { valid:false, reason:"The matchup participants changed" };

  const winnerKey = match.winner === null || match.winner === undefined
    ? null : cleanSideKey(match.winner);
  if (winnerKey !== null && !sides.some(side => side.key === winnerKey))
    return { valid:false, reason:"The matchup winner is not in the market" };
  return { valid:true, draw, bracket, match, sides, winnerKey };
}

function createBracketMatchMarket(state, {
  eventId,
  round,
  match,
}, {
  id = crypto.randomUUID(),
  now = Date.now(),
} = {}) {
  const draft = {
    id,
    kind:CONTEST_MARKET_KIND,
    eventId,
    drawId:state.draws?.[eventId]?.id || null,
    round:cleanInt(round),
    match:cleanInt(match),
    sides:[],
  };
  const draw = state.draws?.[eventId];
  const bracket = state.brackets?.[eventId];
  const bracketMatch = bracket?.rounds?.[draft.round]?.[draft.match];
  if (!draw || !bracketMatch) return { ok:false, error:"No such matchup" };
  if (bracketMatch.winner !== null && bracketMatch.winner !== undefined)
    return { ok:false, error:"Matchup already decided" };
  const teamIndexes = [
    resolveBracketSlot(bracket, bracketMatch.a),
    resolveBracketSlot(bracket, bracketMatch.b),
  ];
  if (teamIndexes.some(teamIndex => teamIndex === null || !draw.teams?.[teamIndex]))
    return { ok:false, error:"Matchup is not fully seated" };
  draft.sides = teamIndexes.map(teamIndex => ({
    key:cleanSideKey(teamIndex),
    players:[...draw.teams[teamIndex].players],
  }));
  return {
    ok:true,
    market:{
      ...draft,
      predictions:{},
      backing:{},
      ante:{ stake:null, responses:{}, activation:null },
      pool:{ activation:null },
      openedAt:now,
      lockedAt:null,
      voidedAt:null,
    },
  };
}

function contestMarketRole(market, player) {
  const competitor = (market?.sides || []).some(side =>
    (side.players || []).includes(player));
  return {
    role:competitor ? "competitor" : "spectator",
    canAnte:!!player && competitor && !market?.lockedAt && !market?.voidedAt,
    canPredict:!!player && !competitor && !market?.lockedAt && !market?.voidedAt,
    canBack:!!player && !competitor && !market?.lockedAt && !market?.voidedAt,
  };
}

const backingEntries = market => Object.entries(market?.backing || {})
  .map(([player, entry]) => ({
    player,
    sideKey:cleanSideKey(entry?.sideKey),
    stake:Number(entry?.stake),
  }))
  .filter(entry => validStake(entry.stake)
    && (market.sides || []).some(side => cleanSideKey(side.key) === entry.sideKey));

function lockContestMarketTerms(market, now = Date.now()) {
  if (market.voidedAt || market.lockedAt) return false;
  const entries = backingEntries(market);
  const fundedOutcomes = [...new Set(entries.map(entry => entry.sideKey))].sort();
  market.pool = market.pool || {};
  market.pool.activation = {
    active:fundedOutcomes.length >= 2,
    fundedOutcomes,
    total:entries.reduce((sum, entry) => sum + entry.stake, 0),
    at:now,
  };

  const sides = Array.isArray(market.sides) ? market.sides : [];
  const stake = Number(market.ante?.stake);
  const responses = market.ante?.responses || {};
  const equalSides = sides.length === 2
    && sides[0].players?.length > 0
    && sides[0].players.length === sides[1].players?.length;
  const participantsBySide = Object.fromEntries(sides.map(side => [
    cleanSideKey(side.key),
    [...(side.players || [])],
  ]));
  const participants = Object.values(participantsBySide).flat();
  const unanimous = equalSides
    && validStake(stake)
    && participants.every(player => responses[player] === "accepted");
  market.ante = market.ante || { stake:null, responses:{} };
  market.ante.activation = {
    active:unanimous,
    stake:validStake(stake) ? stake : null,
    participantsBySide:unanimous ? participantsBySide : {},
    at:now,
  };
  market.lockedAt = now;
  return true;
}

/*
 * Winners keep their own committed backing and divide the losing backing.
 * Largest remainder works in whole chip units, preserves proportionality, and
 * deterministically assigns any leftover unit by player ID.
 */
function pooledDeltas(winners, losers, quantum = MARKET_CHIP) {
  const deltas = blankDeltas();
  const losingUnits = losers.reduce((sum, entry) => sum + entry.stake / quantum, 0);
  const winningUnits = winners.reduce((sum, entry) => sum + entry.stake / quantum, 0);
  if (!losingUnits || !winningUnits) return deltas;

  const shares = winners.map(entry => {
    const weight = entry.stake / quantum;
    const numerator = losingUnits * weight;
    return {
      player:entry.player,
      units:Math.floor(numerator / winningUnits),
      remainder:numerator % winningUnits,
    };
  });
  let remaining = losingUnits - shares.reduce((sum, share) => sum + share.units, 0);
  shares.sort((left, right) =>
    right.remainder - left.remainder || left.player.localeCompare(right.player));
  for (let index = 0; index < remaining; index++) shares[index].units += 1;

  shares.forEach(share => addDelta(deltas, share.player, share.units * quantum));
  losers.forEach(entry => addDelta(deltas, entry.player, -entry.stake));
  return deltas;
}

function backingSettlement(market, winnerKey) {
  const activation = market.pool?.activation;
  const entries = backingEntries(market);
  const total = entries.reduce((sum, entry) => sum + entry.stake, 0);
  if (!activation?.active || activation.total !== total)
    return { active:false, committed:total, deltas:blankDeltas() };
  const winners = entries.filter(entry => entry.sideKey === winnerKey);
  const losers = entries.filter(entry => entry.sideKey !== winnerKey);
  if (!winners.length || !losers.length)
    return { active:false, committed:total, deltas:blankDeltas() };
  const deltas = pooledDeltas(winners, losers);
  return {
    active:true,
    committed:total,
    losingPool:losers.reduce((sum, entry) => sum + entry.stake, 0),
    deltas,
  };
}

function projectedBackingDelta(market, player) {
  const entry = backingEntries(market).find(item => item.player === player);
  if (!entry) return null;
  const entries = backingEntries(market);
  if (new Set(entries.map(item => item.sideKey)).size < 2) return null;
  const winners = entries.filter(item => item.sideKey === entry.sideKey);
  const losers = entries.filter(item => item.sideKey !== entry.sideKey);
  if (!losers.length) return null;
  return pooledDeltas(winners, losers)[player] || 0;
}

function anteSettlement(market, winnerKey) {
  const activation = market.ante?.activation;
  const stake = Number(activation?.stake);
  const participantsBySide = activation?.participantsBySide || {};
  const winnerPlayers = participantsBySide[winnerKey] || [];
  const loserPlayers = Object.entries(participantsBySide)
    .filter(([sideKey]) => sideKey !== winnerKey)
    .flatMap(([, players]) => players);
  const committed = validStake(stake)
    ? Object.values(participantsBySide).flat().length * stake : 0;
  if (!activation?.active || !validStake(stake)
      || !winnerPlayers.length || winnerPlayers.length !== loserPlayers.length)
    return { active:false, committed, deltas:blankDeltas() };
  const deltas = pooledDeltas(
    winnerPlayers.map(player => ({ player, stake })),
    loserPlayers.map(player => ({ player, stake })),
  );
  return { active:true, committed, losingPool:loserPlayers.length * stake, deltas };
}

function resolveContestMarket(state, market) {
  if (!market || market.voidedAt)
    return {
      status:"void",
      reason:market?.voidReason || "Market voided",
      winnerKey:null,
      backing:{ active:false, committed:0, deltas:blankDeltas() },
      ante:{ active:false, committed:0, deltas:blankDeltas() },
      deltas:blankDeltas(),
    };
  const context = bracketMatchContext(state, market);
  if (!context.valid)
    return {
      status:"void",
      reason:context.reason,
      winnerKey:null,
      backing:{ active:false, committed:0, deltas:blankDeltas() },
      ante:{ active:false, committed:0, deltas:blankDeltas() },
      deltas:blankDeltas(),
    };
  if (context.winnerKey === null)
    return {
      status:"pending",
      reason:null,
      winnerKey:null,
      backing:{ active:false, committed:backingEntries(market)
        .reduce((sum, entry) => sum + entry.stake, 0), deltas:blankDeltas() },
      ante:{ active:false, committed:0, deltas:blankDeltas() },
      deltas:blankDeltas(),
    };

  /* A result action normally locks first. Corrupt or hand-authored state that
     has a winner without locked terms safely refunds instead of inventing a
     payout. */
  const backing = market.lockedAt
    ? backingSettlement(market, context.winnerKey)
    : { active:false, committed:0, deltas:blankDeltas() };
  const ante = market.lockedAt
    ? anteSettlement(market, context.winnerKey)
    : { active:false, committed:0, deltas:blankDeltas() };
  const deltas = mergeDeltas(backing.deltas, ante.deltas);
  if (sumDeltas(deltas) !== 0)
    return {
      status:"void",
      reason:"Market settlement did not conserve chips",
      winnerKey:context.winnerKey,
      backing:{ ...backing, active:false, deltas:blankDeltas() },
      ante:{ ...ante, active:false, deltas:blankDeltas() },
      deltas:blankDeltas(),
    };
  return {
    status:"settled",
    reason:null,
    winnerKey:context.winnerKey,
    backing,
    ante,
    deltas,
  };
}

function contestMarketExposure(state, market, player) {
  if (!market || !player || market.voidedAt) return 0;
  const resolved = resolveContestMarket(state, market);
  if (resolved.status !== "pending") return 0;
  const backing = Number(market.backing?.[player]?.stake) || 0;
  const acceptedAnte = market.ante?.responses?.[player] === "accepted"
    ? Number(market.ante?.stake) || 0 : 0;
  if (!market.lockedAt) return backing + acceptedAnte;
  const poolExposure = market.pool?.activation?.active ? backing : 0;
  const antePlayers = Object.values(
    market.ante?.activation?.participantsBySide || {},
  ).flat();
  const anteExposure = market.ante?.activation?.active && antePlayers.includes(player)
    ? Number(market.ante.activation.stake) || 0 : 0;
  return poolExposure + anteExposure;
}

function contestMarketsAtRisk(state, player) {
  return Object.values(state.contestMarkets || {})
    .reduce((sum, market) => sum + contestMarketExposure(state, market, player), 0);
}

function contestMarketPublicSummary(state, market) {
  const settlement = resolveContestMarket(state, market);
  const predictions = Object.values(market?.predictions || {}).map(cleanSideKey);
  const entries = backingEntries(market);
  const sides = (market?.sides || []).map(side => {
    const sideKey = cleanSideKey(side.key);
    return {
      key:sideKey,
      players:[...(side.players || [])],
      predictions:predictions.filter(pick => pick === sideKey).length,
      backing:entries
        .filter(entry => entry.sideKey === sideKey)
        .reduce((sum, entry) => sum + entry.stake, 0),
      backers:entries.filter(entry => entry.sideKey === sideKey).length,
    };
  });
  const anteActivation = market?.ante?.activation;
  const anteCommitted = anteActivation?.active
    ? Object.values(anteActivation.participantsBySide || {}).flat().length
      * Number(anteActivation.stake || 0)
    : 0;
  const backingCommitted = entries.reduce((sum, entry) => sum + entry.stake, 0);
  return {
    id:market?.id,
    eventId:market?.eventId,
    round:market?.round,
    match:market?.match,
    status:settlement.status,
    winnerKey:settlement.winnerKey,
    locked:!!market?.lockedAt,
    voided:!!market?.voidedAt || settlement.status === "void",
    predictionTotal:predictions.length,
    backingCommitted,
    backingActive:market?.lockedAt
      ? !!market.pool?.activation?.active
      : new Set(entries.map(entry => entry.sideKey)).size >= 2,
    anteActive:!!anteActivation?.active,
    anteCommitted,
    totalActivePot:
      (market?.pool?.activation?.active ? backingCommitted : 0) + anteCommitted,
    sides,
  };
}

function hasUnsettledFundedContestMarket(state) {
  return Object.values(state.contestMarkets || {}).some(market =>
    resolveContestMarket(state, market).status === "pending" && (
      (market.sides || []).some(side =>
        (side.players || []).some(player =>
          contestMarketExposure(state, market, player) > 0))
      || Object.keys(market.backing || {}).some(player =>
        contestMarketExposure(state, market, player) > 0)
    ));
}

function lockBracketMatchMarkets(state, eventId, round, match, now = Date.now()) {
  let locked = 0;
  Object.values(state.contestMarkets || {}).forEach(market => {
    if (market.kind !== CONTEST_MARKET_KIND
        || market.eventId !== eventId
        || Number(market.round) !== Number(round)
        || Number(market.match) !== Number(match)
        || market.voidedAt) return;
    if (lockContestMarketTerms(market, now)) locked += 1;
  });
  return locked;
}

function voidContestMarketsForEvent(state, eventId, reason, now = Date.now()) {
  let voided = 0;
  Object.values(state.contestMarkets || {}).forEach(market => {
    if (market.eventId !== eventId || market.voidedAt) return;
    market.voidedAt = now;
    market.voidReason = String(reason || "Contest changed").slice(0, 100);
    voided += 1;
  });
  return voided;
}

export {
  CONTEST_MARKET_KIND,
  MARKET_CHIP,
  bracketMatchContext,
  createBracketMatchMarket,
  contestMarketRole,
  lockContestMarketTerms,
  resolveContestMarket,
  projectedBackingDelta,
  contestMarketExposure,
  contestMarketsAtRisk,
  contestMarketPublicSummary,
  hasUnsettledFundedContestMarket,
  lockBracketMatchMarkets,
  voidContestMarketsForEvent,
  sumDeltas,
};
