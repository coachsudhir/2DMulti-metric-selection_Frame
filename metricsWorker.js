const FRAME_DT = 0.1;
const ACTIVE_SPEED = 1.2;
const SPRINT_SPEED = 7.0;
const HIGH_INTENSITY_SPEED = 5.5;
const HIGH_INTENSITY_ACCEL = 1.3;

function safeDiffAngle(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function rollingMean(arr, i, windowSize) {
  const start = Math.max(0, i - windowSize + 1);
  let sum = 0;
  let count = 0;
  for (let k = start; k <= i; k += 1) {
    const v = arr[k];
    if (Number.isFinite(v)) {
      sum += v;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function computeTeamCompactness(playersAtFrame, playerToTeam) {
  const byTeam = new Map();
  for (const p of playersAtFrame) {
    const teamId = playerToTeam[p.player_id] ?? -1;
    if (!byTeam.has(teamId)) byTeam.set(teamId, []);
    byTeam.get(teamId).push(p);
  }

  const compactness = {};
  byTeam.forEach((plist, teamId) => {
    if (!plist.length) return;
    const cx = plist.reduce((acc, p) => acc + p.x, 0) / plist.length;
    const cy = plist.reduce((acc, p) => acc + p.y, 0) / plist.length;
    const avgSpread = plist.reduce((acc, p) => acc + Math.hypot(p.x - cx, p.y - cy), 0) / plist.length;
    for (const p of plist) {
      compactness[p.player_id] = avgSpread;
    }
  });

  return compactness;
}

self.onmessage = (event) => {
  if (event.data?.type !== "compute") return;

  const { frames, players, playerToTeam, pitchLength, pitchWidth } = event.data.payload;
  const nFrames = frames.length;
  const playerIds = players.map((p) => p.id);

  const positions = {};
  const metricData = {};
  const teamCentroidX = {};

  for (const playerId of playerIds) {
    positions[playerId] = new Array(nFrames).fill(null);
    metricData[playerId] = {
      velocity: new Array(nFrames).fill(0),
      acceleration: new Array(nFrames).fill(0),
      deceleration: new Array(nFrames).fill(0),
      deltaAngle: new Array(nFrames).fill(0),
      distanceCovered: new Array(nFrames).fill(0),
      sprintIntensity: new Array(nFrames).fill(0),
      timeInPossessionZone: new Array(nFrames).fill(0),
      timeOnPitch: new Array(nFrames).fill(0),
      activeTime: new Array(nFrames).fill(0),
      idleTimeRatio: new Array(nFrames).fill(0),
      zoneTimeDef: new Array(nFrames).fill(0),
      zoneTimeMid: new Array(nFrames).fill(0),
      zoneTimeAtt: new Array(nFrames).fill(0),
      heatIntensityScore: new Array(nFrames).fill(0),
      fatigueIndex: new Array(nFrames).fill(0),
      workRatePerMinute: new Array(nFrames).fill(0),
      highIntensityIntervals: new Array(nFrames).fill(0),
      pitchCoverageArea: new Array(nFrames).fill(0),
      heatmapDensityScore: new Array(nFrames).fill(0),
      positionalStabilityIndex: new Array(nFrames).fill(0),
      averagePositionDrift: new Array(nFrames).fill(0),
      pressingIntensityIndex: new Array(nFrames).fill(0),
      distanceNearestOpponent: new Array(nFrames).fill(0),
      teamCompactnessScore: new Array(nFrames).fill(0),
      transitionSpeed: new Array(nFrames).fill(0),
    };
  }

  for (let i = 0; i < nFrames; i += 1) {
    const row = frames[i];
    for (const p of row.player_data || []) {
      if (positions[p.player_id]) {
        positions[p.player_id][i] = { x: p.x, y: p.y, detected: !!p.is_detected };
      }
    }
  }

  const gridX = 14;
  const gridY = 9;
  const totalGridCells = gridX * gridY;

  for (const playerId of playerIds) {
    const pos = positions[playerId];
    const data = metricData[playerId];
    const visited = new Set();
    let cumDistance = 0;
    let sprintCount = 0;
    let highIntervals = 0;
    let cumulativeTimeOnPitch = 0;
    let activeTime = 0;
    let zoneDef = 0;
    let zoneMid = 0;
    let zoneAtt = 0;
    let fatigueCarry = 0;
    let prevAngle = 0;
    let prevVelocity = 0;

    for (let i = 1; i < nFrames; i += 1) {
      const a = pos[i - 1];
      const b = pos[i];

      if (b) {
        cumulativeTimeOnPitch += FRAME_DT;
        data.timeOnPitch[i] = cumulativeTimeOnPitch;
      } else {
        data.timeOnPitch[i] = cumulativeTimeOnPitch;
      }

      if (a && b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const velocity = dist / FRAME_DT;
        const acceleration = (velocity - prevVelocity) / FRAME_DT;
        const angle = Math.atan2(dy, dx);
        const dAngle = safeDiffAngle(angle, prevAngle);

        cumDistance += dist;

        data.velocity[i] = velocity;
        data.acceleration[i] = acceleration;
        data.deceleration[i] = acceleration < 0 ? -acceleration : 0;
        data.deltaAngle[i] = dAngle;
        data.distanceCovered[i] = cumDistance;

        if (velocity > SPRINT_SPEED) sprintCount += 1;
        data.sprintIntensity[i] = sprintCount / Math.max(1, cumulativeTimeOnPitch);

        if (velocity > ACTIVE_SPEED) activeTime += FRAME_DT;
        data.activeTime[i] = activeTime;
        const idle = Math.max(0, cumulativeTimeOnPitch - activeTime);
        data.idleTimeRatio[i] = cumulativeTimeOnPitch ? idle / cumulativeTimeOnPitch : 0;

        const xNorm = b.x / (pitchLength / 2);
        if (xNorm < -0.33) zoneDef += FRAME_DT;
        else if (xNorm < 0.33) zoneMid += FRAME_DT;
        else zoneAtt += FRAME_DT;
        data.zoneTimeDef[i] = zoneDef;
        data.zoneTimeMid[i] = zoneMid;
        data.zoneTimeAtt[i] = zoneAtt;

        data.timeInPossessionZone[i] = zoneAtt;
        data.heatIntensityScore[i] = rollingMean(data.velocity, i, 25) * 0.6 + rollingMean(data.acceleration, i, 25) * 0.4;

        const sprintDecay = rollingMean(data.sprintIntensity, i, 30);
        fatigueCarry = fatigueCarry * 0.98 + (Math.abs(acceleration) * 0.02 + sprintDecay * 0.05);
        data.fatigueIndex[i] = fatigueCarry;

        data.workRatePerMinute[i] = cumulativeTimeOnPitch > 0 ? cumDistance / (cumulativeTimeOnPitch / 60) : 0;

        if (velocity > HIGH_INTENSITY_SPEED && acceleration > HIGH_INTENSITY_ACCEL) {
          highIntervals += 1;
        }
        data.highIntensityIntervals[i] = highIntervals;

        const gx = Math.floor(((b.x + pitchLength / 2) / pitchLength) * gridX);
        const gy = Math.floor(((b.y + pitchWidth / 2) / pitchWidth) * gridY);
        const key = `${Math.max(0, Math.min(gridX - 1, gx))}_${Math.max(0, Math.min(gridY - 1, gy))}`;
        visited.add(key);
        data.pitchCoverageArea[i] = visited.size / totalGridCells;
        data.heatmapDensityScore[i] = visited.size ? cumDistance / visited.size : 0;

        const sWin = 60;
        const start = Math.max(0, i - sWin + 1);
        let meanX = 0;
        let meanY = 0;
        let c = 0;
        for (let k = start; k <= i; k += 1) {
          if (pos[k]) {
            meanX += pos[k].x;
            meanY += pos[k].y;
            c += 1;
          }
        }
        if (c > 0) {
          meanX /= c;
          meanY /= c;
          let varSum = 0;
          for (let k = start; k <= i; k += 1) {
            if (pos[k]) {
              varSum += (pos[k].x - meanX) ** 2 + (pos[k].y - meanY) ** 2;
            }
          }
          const std = Math.sqrt(varSum / c);
          data.positionalStabilityIndex[i] = 1 / (1 + std);
          data.averagePositionDrift[i] = Math.hypot(b.x - meanX, b.y - meanY);
        }

        prevAngle = angle;
        prevVelocity = velocity;
      } else {
        data.distanceCovered[i] = cumDistance;
        data.sprintIntensity[i] = cumulativeTimeOnPitch ? sprintCount / cumulativeTimeOnPitch : 0;
        data.activeTime[i] = activeTime;
        data.idleTimeRatio[i] = cumulativeTimeOnPitch ? (cumulativeTimeOnPitch - activeTime) / cumulativeTimeOnPitch : 0;
        data.zoneTimeDef[i] = zoneDef;
        data.zoneTimeMid[i] = zoneMid;
        data.zoneTimeAtt[i] = zoneAtt;
        data.timeInPossessionZone[i] = zoneAtt;
        data.fatigueIndex[i] = fatigueCarry;
        data.workRatePerMinute[i] = cumulativeTimeOnPitch > 0 ? cumDistance / (cumulativeTimeOnPitch / 60) : 0;
        data.highIntensityIntervals[i] = highIntervals;
        data.pitchCoverageArea[i] = visited.size / totalGridCells;
        data.heatmapDensityScore[i] = visited.size ? cumDistance / visited.size : 0;
      }
    }
  }

  for (let i = 0; i < nFrames; i += 1) {
    const playersAtFrame = frames[i].player_data || [];

    const byTeamPositions = new Map();
    for (const p of playersAtFrame) {
      const teamId = playerToTeam[p.player_id] ?? -1;
      if (!byTeamPositions.has(teamId)) byTeamPositions.set(teamId, []);
      byTeamPositions.get(teamId).push(p);
    }

    byTeamPositions.forEach((plist, teamId) => {
      if (!plist.length) return;
      const cx = plist.reduce((acc, p) => acc + p.x, 0) / plist.length;
      if (!teamCentroidX[teamId]) teamCentroidX[teamId] = new Array(nFrames).fill(0);
      teamCentroidX[teamId][i] = cx;
    });

    const compactness = computeTeamCompactness(playersAtFrame, playerToTeam);

    for (const p of playersAtFrame) {
      const playerId = p.player_id;
      const d = metricData[playerId];
      if (!d) continue;

      d.teamCompactnessScore[i] = compactness[playerId] || 0;

      let nearest = Infinity;
      for (const q of playersAtFrame) {
        if (q.player_id === playerId) continue;
        if ((playerToTeam[q.player_id] ?? -1) === (playerToTeam[playerId] ?? -1)) continue;
        nearest = Math.min(nearest, Math.hypot(q.x - p.x, q.y - p.y));
      }
      d.distanceNearestOpponent[i] = Number.isFinite(nearest) ? nearest : 0;

      const ball = frames[i].ball_data;
      if (ball && Number.isFinite(ball.x) && Number.isFinite(ball.y)) {
        const toBall = Math.hypot(ball.x - p.x, ball.y - p.y);
        const vel = d.velocity[i] || 0;
        d.pressingIntensityIndex[i] = toBall < 20 ? vel * (1 - clamp01(toBall / 20)) : 0;
      }
    }
  }

  Object.keys(teamCentroidX).forEach((teamId) => {
    const centroid = teamCentroidX[teamId];
    const transition = new Array(nFrames).fill(0);
    for (let i = 1; i < nFrames; i += 1) {
      transition[i] = Math.abs((centroid[i] - centroid[i - 1]) / FRAME_DT);
    }

    for (const playerId of playerIds) {
      if ((playerToTeam[playerId] ?? -1) === Number(teamId)) {
        metricData[playerId].transitionSpeed = transition;
      }
    }
  });

  self.postMessage({ type: "ready", payload: { metricData } });
};
