/** Presentation of a selected task from its saved position events, never a live feed. */
export function missionView(mission, events, minute, nodes) {
  if (!mission) return null;
  const at = Number.isFinite(Number(minute)) ? Number(minute) : 0;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ended = Number.isFinite(mission.actual_end_min) && at >= mission.actual_end_min;
  const sampleTime = ended ? mission.actual_end_min : at;
  const samples = events.filter(event => event.kind === 'position' && event.code === mission.code &&
    Number.isFinite(event.at_min) && byId.has(event.node) && (!ended || event.at_min <= sampleTime)).map((event, order) => ({
      node: event.node, at: event.at_min, order, position: byId.get(event.node)
    })).sort((a, b) => a.at - b.at || a.order - b.order);
  const start = mission.actual_start_min;
  const pending = at < start;
  let index = -1;
  for (let i = 0; i < samples.length && samples[i].at <= sampleTime; i++) index = i;
  const left = samples[Math.max(0, index)];
  const right = samples[index + 1];
  let position = null;
  let fraction = 0;
  if (!pending && index >= 0 && left) {
    fraction = right && right.at > left.at ? Math.min(1, Math.max(0, (sampleTime - left.at) / (right.at - left.at))) : 0;
    position = {};
    for (const key of ['lat', 'lon', 'x', 'y']) {
      const a = left.position[key], b = right?.position[key];
      position[key] = Number.isFinite(a) ? (Number.isFinite(b) ? a + (b - a) * fraction : a) : null;
    }
  }
  // Retain event order: reposition and delivery can visit the same node twice.
  const pickupIndex = mission.reposition_nodes?.length ? mission.reposition_nodes.length - 1 :
    Math.max(0, samples.findIndex(sample => sample.node === mission.origin));
  let stage = pending ? 'pending' : index < pickupIndex ? 'reposition' : 'transport';
  if (ended) stage = mission.outcome === 'arrived' ? 'delivered' : mission.outcome === 'failed' ? 'failed' : 'unknown';
  else if (!pending && (index < 0 || !samples.length || (!right && at >= mission.replay_end_min))) stage = 'unknown';
  const labels = {pending:'待派遣',reposition:'前往取货点',transport:'运送中',delivered:'已交付',failed:'任务中断',unknown:'记录待确认'};
  let progress = pending ? 0 : samples.length > 1 ? (Math.max(0, index) + fraction) / (samples.length - 1) * 100 : 0;
  progress = stage === 'delivered' ? 100 : Math.min(99.9, Math.max(0, progress));
  const path = (mission.path_nodes || []).map(id => byId.get(id)).filter(Boolean);
  if (stage === 'delivered') position = byId.get(mission.destination) || position;
  const traveled = stage === 'delivered' ? path : pending || !position ? [] : samples.slice(0, Math.max(0, index) + 1).map(sample => sample.position).concat(position);
  const remaining = stage === 'delivered' ? [] : pending ? path : position ? [position, ...samples.slice(index + 1).map(sample => sample.position)] : path;
  return {stage, label:labels[stage], progress, position, path, traveled, remaining,
    origin:byId.get(mission.origin), destination:byId.get(mission.destination),
    departure:path[0], from:left?.position, next:pending ? path[0] : right?.position,
    index, hasReposition:pickupIndex > 0, pickupAt:samples[pickupIndex]?.at,
    secondsUntilStart:pending ? Math.max(0, start - at) * 60 : 0};
}
