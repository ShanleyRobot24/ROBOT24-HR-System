// Line item categories. Keys are stored on each invoice line.

export const EXPENSE_CATEGORIES = [
  ['hotel', 'Hotel'],
  ['flights', 'Flights'],
  ['train_bus', 'Train and bus'],
  ['taxi_uber', 'Taxi and Uber'],
  ['car_fuel', 'Car, fuel, parking'],
  ['meals', 'Meals, per diem'],
  ['equipment', 'Equipment hire'],
  ['data_phone', 'Data and phone'],
  ['visa_fees', 'Visa and permits'],
  ['other', 'Other'],
];

export const FEE_CATEGORIES = [
  ['day_rate', 'Day rate'],
  ['fixed_fee', 'Fixed fee'],
  ['editing', 'Editing'],
  ['other_fee', 'Other fee'],
];

// Older invoices used broader names
const LEGACY = { accommodation: 'hotel', local_transport: 'taxi_uber' };
const EXTRA_LABELS = { travel: 'Travel (unsorted)', uncategorised: 'Uncategorised' };

const LABELS = Object.fromEntries([...EXPENSE_CATEGORIES, ...FEE_CATEGORIES]);

export function normaliseCategory(key, kind = 'expense') {
  const k = LEGACY[key] || key;
  if (LABELS[k] || EXTRA_LABELS[k]) return k;
  return kind === 'fee' ? 'other_fee' : 'other';
}

export function categoryLabel(key) {
  const k = LEGACY[key] || key;
  return LABELS[k] || EXTRA_LABELS[k] || 'Other';
}

export const AI_CATEGORY_GUIDE = `Line item categories:
- fees: "day_rate" (daily rate), "fixed_fee" (flat project fee), "editing" (edit or post production), "other_fee"
- expenses: "hotel" (hotels, Airbnb, any lodging), "flights", "train_bus" (trains, buses, metro, ferries), "taxi_uber" (Uber, Grab, Didi, Careem, Bolt, any taxi or ride hailing), "car_fuel" (car hire, fuel, tolls, parking), "meals" (food, drinks, per diem), "equipment" (equipment or gear hire, batteries, cables), "data_phone" (SIM, eSIM, roaming, mobile data, wifi), "visa_fees" (visas, permits, accreditation), "other"`;

// Keyword backup for the AI: what someone wrote on a line decides its category.
// Order matters: the first rule that matches wins.
const KEYWORDS = [
  ['taxi_uber', /\b(uber|careem|grab|didi|bolt|lyft|ola|gojek|cabify|taxi|cab|ride ?hail|kakao ?t)\b/i],
  ['flights', /\b(flight|flights|airfare|air ticket|airline|boarding pass|emirates|etihad|flydubai|qatar airways|lufthansa|klm|british airways|korean air|air china|cathay|singapore airlines|turkish airlines|baggage)\b/i],
  ['train_bus', /\b(train|rail|railway|ktx|shinkansen|eurostar|amtrak|metro|subway|tube|bus|coach|ferry|tram|mrt|transit card|oyster)\b/i],
  ['hotel', /\b(hotel|hotels|airbnb|hostel|motel|accommodation|lodging|room night|nights? stay|marriott|hilton|hyatt|ibis|novotel|radisson|booking\.com|agoda)\b/i],
  ['car_fuel', /\b(fuel|petrol|gas station|diesel|parking|toll|tolls|car hire|car rental|rental car|hertz|avis|sixt|mileage)\b/i],
  ['meals', /\b(meal|meals|food|lunch|dinner|breakfast|per diem|perdiem|restaurant|coffee|snacks|catering|water)\b/i],
  ['data_phone', /\b(sim|e-?sim|roaming|mobile data|data plan|phone credit|top ?up|wifi|wi-fi|internet)\b/i],
  ['visa_fees', /\b(visa|permit|accreditation|press pass|entry fee|immigration)\b/i],
  ['equipment', /\b(equipment|gear|camera|lens|tripod|gimbal|drone|microphone|mic|batter(y|ies)|sd card|memory card|cable|lighting|rental kit|hard drive)\b/i],
];

export function guessCategory(text) {
  if (!text) return null;
  for (const [cat, re] of KEYWORDS) if (re.test(text)) return cat;
  return null;
}

// Robot24 always books and pays hotels and flights itself. Freelancers never invoice for them,
// so these never count towards a bill. They are recorded under "Booked by Robot24" instead.
export const COMPANY_BOOKED = ['hotel', 'flights'];
export const INVOICE_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter(([k]) => !COMPANY_BOOKED.includes(k));
export const COMPANY_BOOKED_NOTE = 'Robot24 books hotels and flights directly, so freelancers are never paid for them.';
