// Known VC firms and angel investors most-often mentioned in AI funding rounds.
// Used by enrichInvestors() to map raw names parsed from RSS headlines/bodies
// to a canonical name + logo URL + known/unknown classification.
//
// To add an investor: append to KNOWN_INVESTORS with the canonical name,
// every plausible alias seen in the wild, the firm's primary domain (used to
// build a Clearbit logo URL) and any github org for fallback avatar lookup.
//
// Matching strategy (see enrich-investors.ts):
//   1. Lowercase + collapse whitespace + strip suffixes ("Capital", "Ventures",
//      "Partners", "LLC", "Inc") on the raw name AND each alias key.
//   2. Match if normalized raw equals a normalized alias OR if either
//      normalized form contains the other. This handles "a16z" vs
//      "Andreessen Horowitz" and "Sequoia" vs "Sequoia Capital" symmetrically.
//
// Logo strategy:
//   - When `domain` is set, build `https://logo.clearbit.com/<domain>`.
//   - When only `github` is set, build `https://github.com/<org>.png`.
//   - The page falls back to the firm's initials when both are missing.

export interface KnownInvestor {
  /** Canonical display name. */
  name: string;
  /** Aliases seen in the wild (lowercase or original casing — both are
   *  normalized at match time). Always include the canonical name in lowercase. */
  aliases: readonly string[];
  /** Primary domain — used to build a Clearbit logo URL when present. */
  domain?: string;
  /** GitHub org — used as a logo fallback when no domain is available. */
  github?: string;
}

export const KNOWN_INVESTORS: ReadonlyArray<KnownInvestor> = [
  {
    name: 'Andreessen Horowitz',
    aliases: ['andreessen horowitz', 'a16z', 'andreessen', 'ah capital', 'a16z crypto'],
    domain: 'a16z.com',
  },
  {
    name: 'Sequoia Capital',
    aliases: ['sequoia capital', 'sequoia', 'sequoia china', 'sequoia india', 'peak xv'],
    domain: 'sequoiacap.com',
  },
  {
    name: 'Lightspeed Venture Partners',
    aliases: ['lightspeed venture partners', 'lightspeed', 'lightspeed ventures'],
    domain: 'lsvp.com',
  },
  {
    name: 'Khosla Ventures',
    aliases: ['khosla ventures', 'khosla', 'vinod khosla'],
    domain: 'khoslaventures.com',
  },
  {
    name: 'Founders Fund',
    aliases: ['founders fund', 'founders found', 'peter thiel', 'thiel'],
    domain: 'foundersfund.com',
  },
  {
    name: 'Google Ventures',
    aliases: ['google ventures', 'gv', 'gradient ventures'],
    domain: 'gv.com',
  },
  {
    name: 'NEA',
    aliases: ['nea', 'new enterprise associates'],
    domain: 'nea.com',
  },
  {
    name: 'Index Ventures',
    aliases: ['index ventures', 'index'],
    domain: 'indexventures.com',
  },
  {
    name: 'Kleiner Perkins',
    aliases: ['kleiner perkins', 'kleiner', 'kpcb'],
    domain: 'kleinerperkins.com',
  },
  {
    name: 'Greylock',
    aliases: ['greylock', 'greylock partners'],
    domain: 'greylock.com',
  },
  {
    name: 'Bessemer Venture Partners',
    aliases: ['bessemer venture partners', 'bessemer', 'bvp'],
    domain: 'bvp.com',
  },
  {
    name: 'Accel',
    aliases: ['accel', 'accel partners'],
    domain: 'accel.com',
  },
  {
    name: 'IVP',
    aliases: ['ivp', 'institutional venture partners'],
    domain: 'ivp.com',
  },
  {
    name: 'Benchmark',
    aliases: ['benchmark', 'benchmark capital'],
    domain: 'benchmark.com',
  },
  {
    name: 'Y Combinator',
    aliases: ['y combinator', 'yc', 'ycombinator'],
    domain: 'ycombinator.com',
  },
  {
    name: 'Tiger Global',
    aliases: ['tiger global', 'tiger global management', 'tiger'],
    domain: 'tigerglobal.com',
  },
  {
    name: 'SoftBank',
    aliases: ['softbank', 'softbank vision fund', 'vision fund', 'softbank group'],
    domain: 'softbank.com',
  },
  {
    name: 'NVentures',
    aliases: ['nventures', 'nvidia ventures', 'nvidia'],
    domain: 'nvidia.com',
  },
  {
    name: 'Microsoft',
    aliases: ['microsoft', 'microsoft m12', 'm12', 'microsoft ventures'],
    domain: 'microsoft.com',
  },
  {
    name: 'Salesforce Ventures',
    aliases: ['salesforce ventures', 'salesforce'],
    domain: 'salesforce.com',
  },
  {
    name: 'Insight Partners',
    aliases: ['insight partners', 'insight venture partners', 'insight'],
    domain: 'insightpartners.com',
  },
  {
    name: 'General Catalyst',
    aliases: ['general catalyst', 'gc'],
    domain: 'generalcatalyst.com',
  },
  {
    name: 'Coatue',
    aliases: ['coatue', 'coatue management'],
    domain: 'coatue.com',
  },
  {
    name: 'Thrive Capital',
    aliases: ['thrive capital', 'thrive', 'joshua kushner'],
    domain: 'thrivecap.com',
  },
  {
    name: 'Redpoint Ventures',
    aliases: ['redpoint ventures', 'redpoint'],
    domain: 'redpoint.com',
  },
  {
    name: 'First Round Capital',
    aliases: ['first round capital', 'first round'],
    domain: 'firstround.com',
  },
  {
    name: 'Bain Capital Ventures',
    aliases: ['bain capital ventures', 'bain capital', 'bcv'],
    domain: 'baincapitalventures.com',
  },
  {
    name: 'Greenoaks',
    aliases: ['greenoaks', 'greenoaks capital'],
    domain: 'greenoaks.com',
  },
  {
    name: 'BlackRock',
    aliases: ['blackrock', 'blackrock private equity'],
    domain: 'blackrock.com',
  },
  {
    name: 'Fidelity',
    aliases: ['fidelity', 'fidelity management', 'fmr'],
    domain: 'fidelity.com',
  },
  {
    name: 'Bond Capital',
    aliases: ['bond capital', 'bond'],
    domain: 'bondcap.com',
  },
  {
    name: 'D1 Capital',
    aliases: ['d1 capital', 'd1'],
    domain: 'd1capital.com',
  },
  {
    name: 'Dragoneer',
    aliases: ['dragoneer', 'dragoneer investment group'],
    domain: 'dragoneer.com',
  },
  {
    name: 'T. Rowe Price',
    aliases: ['t. rowe price', 't rowe price', 't.rowe price', 'trowe price'],
    domain: 'troweprice.com',
  },
  {
    name: 'Wellington Management',
    aliases: ['wellington management', 'wellington'],
    domain: 'wellington.com',
  },
  {
    name: 'Baillie Gifford',
    aliases: ['baillie gifford'],
    domain: 'bailliegifford.com',
  },
  {
    name: 'Lux Capital',
    aliases: ['lux capital', 'lux'],
    domain: 'luxcapital.com',
  },
  {
    name: 'Menlo Ventures',
    aliases: ['menlo ventures', 'menlo'],
    domain: 'menlovc.com',
  },
  {
    name: 'Mayfield',
    aliases: ['mayfield', 'mayfield fund'],
    domain: 'mayfield.com',
  },
  {
    name: 'Norwest Venture Partners',
    aliases: ['norwest venture partners', 'norwest', 'nvp'],
    domain: 'nvp.com',
  },
  {
    name: 'True Ventures',
    aliases: ['true ventures'],
    domain: 'trueventures.com',
  },
  {
    name: 'Uncork Capital',
    aliases: ['uncork capital', 'uncork'],
    domain: 'uncorkcapital.com',
  },
  {
    name: 'Slow Ventures',
    aliases: ['slow ventures', 'slow'],
    domain: 'slow.co',
  },
  {
    name: 'SV Angel',
    aliases: ['sv angel', 'ron conway'],
    domain: 'svangel.com',
  },
  {
    name: 'DCM Ventures',
    aliases: ['dcm ventures', 'dcm'],
    domain: 'dcm.com',
  },
  {
    name: '8VC',
    aliases: ['8vc'],
    domain: '8vc.com',
  },
  {
    name: 'Valor Equity Partners',
    aliases: ['valor equity partners', 'valor'],
    domain: 'valorep.com',
  },
  {
    name: 'Alkeon Capital',
    aliases: ['alkeon capital', 'alkeon'],
    domain: 'alkeon.com',
  },
  {
    name: 'Iconiq Capital',
    aliases: ['iconiq capital', 'iconiq', 'iconiq growth'],
    domain: 'iconiqcapital.com',
  },
  {
    name: 'Spark Capital',
    aliases: ['spark capital', 'spark'],
    domain: 'sparkcapital.com',
  },
  {
    name: 'Battery Ventures',
    aliases: ['battery ventures', 'battery'],
    domain: 'battery.com',
  },
  {
    name: 'Costanoa Ventures',
    aliases: ['costanoa ventures', 'costanoa'],
    domain: 'costanoa.vc',
  },
  {
    name: 'Founder Collective',
    aliases: ['founder collective'],
    domain: 'foundercollective.com',
  },
  {
    name: 'Initialized Capital',
    aliases: ['initialized capital', 'initialized'],
    domain: 'initialized.com',
  },
  {
    name: 'Conviction',
    aliases: ['conviction', 'conviction partners', 'sarah guo'],
    domain: 'conviction.com',
  },
  {
    name: 'Radical Ventures',
    aliases: ['radical ventures', 'radical'],
    domain: 'radical.vc',
  },
  {
    name: 'Balderton Capital',
    aliases: ['balderton capital', 'balderton'],
    domain: 'balderton.com',
  },
  {
    name: 'Atomico',
    aliases: ['atomico'],
    domain: 'atomico.com',
  },
  {
    name: 'Creandum',
    aliases: ['creandum'],
    domain: 'creandum.com',
  },
  {
    name: 'Northzone',
    aliases: ['northzone'],
    domain: 'northzone.com',
  },
  {
    name: 'Point Nine',
    aliases: ['point nine', 'point nine capital', 'p9'],
    domain: 'pointnine.com',
  },
  {
    name: 'Hoxton Ventures',
    aliases: ['hoxton ventures', 'hoxton'],
    domain: 'hoxtonventures.com',
  },
  {
    name: 'Nat Friedman',
    aliases: ['nat friedman', 'daniel gross', 'nat & daniel', 'nat and daniel'],
    domain: 'nat.org',
  },
];

// Pre-computed normalized lookup index, keyed by normalized alias to the
// canonical record. Built once at module load — adding investors costs O(n)
// alias additions, not O(n) rebuild on every enrich call.
export interface NormalizedIndexEntry {
  /** Original normalized alias key (used for prefix/contains comparisons). */
  key: string;
  investor: KnownInvestor;
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[.,&'’()]/g, ' ')
    .replace(/\b(capital|ventures|venture|partners|partner|management|group|llc|inc|fund|holdings|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeInvestorName(input: string): string {
  return normalize(input);
}

export const NORMALIZED_INDEX: ReadonlyArray<NormalizedIndexEntry> = (() => {
  const entries: NormalizedIndexEntry[] = [];
  for (const investor of KNOWN_INVESTORS) {
    const seen = new Set<string>();
    for (const alias of [investor.name, ...investor.aliases]) {
      const key = normalize(alias);
      if (key.length === 0 || seen.has(key)) continue;
      seen.add(key);
      entries.push({ key, investor });
    }
  }
  // Longer keys first — prevents "ai" matching before "andreessen horowitz".
  entries.sort((a, b) => b.key.length - a.key.length);
  return entries;
})();

export function buildInvestorLogoUrl(investor: KnownInvestor): string | null {
  if (investor.domain) return `https://logo.clearbit.com/${investor.domain}`;
  if (investor.github) return `https://github.com/${investor.github}.png`;
  return null;
}
