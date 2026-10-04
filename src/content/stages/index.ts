import type { CampaignDef } from '../../gameplay/StageTypes';
import { stage as z1 } from './z1';
import { stage as z2 } from './z2';
import { stage as z3 } from './z3';
import { stage as d1 } from './d1';
import { stage as d2 } from './d2';
import { stage as d3 } from './d3';

export const CAMPAIGNS: CampaignDef[] = [
  {
    id: 'zombie',
    name: 'DEAD ZONE',
    tagline: 'The city fell overnight. Fight your way out.',
    accent: '#ff3b3b',
    stages: [z1, z2, z3],
  },
  {
    id: 'dino',
    name: 'PRIMAL ISLAND',
    tagline: 'The park is open. The fences are not.',
    accent: '#ffb000',
    stages: [d1, d2, d3],
  },
];

export const ALL_STAGES = CAMPAIGNS.flatMap((c) => c.stages);
