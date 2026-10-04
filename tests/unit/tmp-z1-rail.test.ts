import { it } from 'vitest';
import * as THREE from 'three';
import { RailRig } from '../../src/gameplay/RailRig';
import { RAIL } from '../../src/content/stages/z1/layout';

it('rail distances', () => {
  const rig = new RailRig(new THREE.PerspectiveCamera());
  rig.setPath(RAIL);
  console.log('length', rig.length.toFixed(1));
  const out: string[] = [];
  for (let d = 0; d <= rig.length; d += 5) {
    const p = rig.pointAt(d);
    out.push(`${d}: ${p.x.toFixed(1)},${p.z.toFixed(1)} h=${(rig.headingAt(d) * 180 / Math.PI).toFixed(0)}`);
  }
  console.log(out.join('\n'));
  // nearest d for key points
  const key: [string, number, number][] = [['alleyStart', -17, -155], ['alleyEnd', -44, -155], ['turn2', -58, -169], ['gas', -58, -209], ['bus', -58, -238], ['sq', -58, -268], ['end', -58, -284]];
  for (const [n, x, z] of key) {
    let best = 0, bd = 1e9;
    for (let d = 0; d <= rig.length; d += 0.25) { const p = rig.pointAt(d); const dd = Math.hypot(p.x - x, p.z - z); if (dd < bd) { bd = dd; best = d; } }
    console.log(n, best, bd.toFixed(2));
  }
});
