// Tidy country names so "UAE", "U.A.E." and "United Arab Emirates" group together
const ALIASES = {
  uae: 'United Arab Emirates', 'u.a.e': 'United Arab Emirates', 'u.a.e.': 'United Arab Emirates', emirates: 'United Arab Emirates', dubai: 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates',
  us: 'United States', usa: 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States', america: 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', 'u.k.': 'United Kingdom', england: 'United Kingdom', britain: 'United Kingdom', 'great britain': 'United Kingdom', london: 'United Kingdom',
  ksa: 'Saudi Arabia', 'south korea': 'South Korea', korea: 'South Korea', 'republic of korea': 'South Korea', prc: 'China', 'mainland china': 'China',
  turkiye: 'Turkey', 'türkiye': 'Turkey', holland: 'Netherlands', 'the netherlands': 'Netherlands', singapore: 'Singapore', hk: 'Hong Kong',
};
const FLAGS = {
  'United Arab Emirates': '🇦🇪', 'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Saudi Arabia': '🇸🇦', 'South Korea': '🇰🇷', China: '🇨🇳',
  Japan: '🇯🇵', Singapore: '🇸🇬', Turkey: '🇹🇷', France: '🇫🇷', Germany: '🇩🇪', Spain: '🇪🇸', Italy: '🇮🇹', Portugal: '🇵🇹', Netherlands: '🇳🇱',
  Canada: '🇨🇦', India: '🇮🇳', Qatar: '🇶🇦', Oman: '🇴🇲', Bahrain: '🇧🇭', Kuwait: '🇰🇼', Egypt: '🇪🇬', 'Hong Kong': '🇭🇰', Taiwan: '🇹🇼',
  Switzerland: '🇨🇭', Belgium: '🇧🇪', Austria: '🇦🇹', Sweden: '🇸🇪', Denmark: '🇩🇰', Norway: '🇳🇴', Ireland: '🇮🇪', Australia: '🇦🇺', Brazil: '🇧🇷', Mexico: '🇲🇽',
};
export const COUNTRY_LIST = Object.keys(FLAGS).sort();

export function countryName(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  const known = Object.keys(FLAGS).find((k) => k.toLowerCase() === key);
  return known || raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Where a job is: its country, else its city, else "Place not set"
export function placeOf(a) {
  return countryName(a.country) || countryName(a.city) || 'Place not set';
}

export const flagOf = (place) => FLAGS[place] || '🌍';
