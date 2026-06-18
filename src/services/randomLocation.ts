import type { Location } from '../data/locations';

// Curated list of urban street-level locations with confirmed Street View coverage.
// Coordinates are placed on actual roads/pavements, not just near landmarks.
// Global spread across all continents and climate zones.
const LOCATIONS: ReadonlyArray<{ lat: number; lng: number; head: number; name: string; h: string }> = [
  // ── North America ──────────────────────────────────────────────────────
  { lat: 40.7548, lng: -73.9862, head: 270, name: 'Times Square, New York', h: 'Temperate. Densely built midtown Manhattan, USA.' },
  { lat: 41.8826, lng: -87.6236, head: 0,   name: 'The Loop, Chicago', h: 'Temperate. Elevated rail and skyscraper district, Illinois, USA.' },
  { lat: 34.0522, lng: -118.2529, head: 90,  name: 'Downtown Los Angeles', h: 'Subtropical. Sprawling West Coast city, California, USA.' },
  { lat: 29.9511, lng: -90.0670, head: 90,  name: 'French Quarter, New Orleans', h: 'Subtropical. Historic district in Louisiana, USA.' },
  { lat: 47.6038, lng: -122.3301, head: 180, name: 'Downtown Seattle', h: 'Temperate oceanic. Pacific Northwest city, Washington, USA.' },
  { lat: 25.7748, lng: -80.1910, head: 0,   name: 'South Beach, Miami', h: 'Tropical. Art Deco beach district in Florida, USA.' },
  { lat: 36.1716, lng: -115.1391, head: 0,   name: 'Las Vegas Strip', h: 'Desert. Neon boulevard in the Nevada desert, USA.' },
  { lat: 39.7496, lng: -104.9965, head: 270, name: '16th Street Mall, Denver', h: 'Temperate. Mile-high pedestrian street in Colorado, USA.' },
  { lat: 29.7543, lng: -95.3677, head: 90,  name: 'Downtown Houston', h: 'Humid subtropical. Oil-city skyline in Texas, USA.' },
  { lat: 32.7827, lng: -96.7973, head: 180, name: 'Downtown Dallas', h: 'Subtropical. Modern skyline in North Texas, USA.' },
  { lat: 37.7879, lng: -122.4075, head: 270, name: 'Union Square, San Francisco', h: 'Temperate oceanic. Hilly bayside city in California, USA.' },
  { lat: 38.9071, lng: -77.0368, head: 0,   name: 'Penn Ave, Washington DC', h: 'Temperate. Capital boulevard near the White House, USA.' },
  { lat: 42.3601, lng: -71.0589, head: 90,  name: 'Downtown Boston', h: 'Temperate. Historic New England city, Massachusetts, USA.' },
  { lat: 43.6534, lng: -79.3823, head: 0,   name: 'Downtown Toronto', h: 'Temperate. Canada\'s largest city on Lake Ontario.' },
  { lat: 45.5088, lng: -73.5540, head: 90,  name: 'Downtown Montréal', h: 'Temperate continental. Bilingual city in Québec, Canada.' },
  { lat: 49.2827, lng: -123.1207, head: 270, name: 'Downtown Vancouver', h: 'Temperate oceanic. Mountain-backed city in British Columbia, Canada.' },
  { lat: 19.4328, lng: -99.1330, head: 180, name: 'Centro Histórico, Mexico City', h: 'Subtropical highland. Capital of Mexico at 2,250 m altitude.' },
  { lat: 20.9750, lng: -89.6218, head: 90,  name: 'Centro, Mérida', h: 'Tropical. Colonial city in the Yucatán Peninsula, Mexico.' },
  { lat: 23.1366, lng: -82.3590, head: 90,  name: 'Old Havana, Cuba', h: 'Tropical. Colourful colonial streets of the Cuban capital.' },
  // ── South America ──────────────────────────────────────────────────────
  { lat: -22.9068, lng: -43.1729, head: 270, name: 'Copacabana, Rio de Janeiro', h: 'Tropical. Famous beachside boulevard in Brazil.' },
  { lat: -23.5489, lng: -46.6388, head: 90,  name: 'Paulista Avenue, São Paulo', h: 'Subtropical. The financial spine of Brazil.' },
  { lat: -34.6073, lng: -58.3748, head: 0,   name: 'Puerto Madero, Buenos Aires', h: 'Temperate. Redeveloped waterfront in Argentina\'s capital.' },
  { lat: -33.4372, lng: -70.6506, head: 90,  name: 'Bellavista, Santiago', h: 'Mediterranean. Bohemian neighbourhood in Chile\'s capital.' },
  { lat: 4.6971,  lng: -74.0456, head: 180, name: 'La Candelaria, Bogotá', h: 'Subtropical highland. Historic centre of Colombia\'s capital.' },
  { lat: -12.0432, lng: -77.0282, head: 0,   name: 'Miraflores, Lima', h: 'Desert coast. Upscale clifftop district in Peru.' },
  { lat: -0.9676,  lng: -80.7089, head: 90,  name: 'Malecón, Manta', h: 'Tropical. Pacific port city on the Ecuadorian coast.' },
  { lat: -16.5000, lng: -68.1193, head: 270, name: 'El Prado, La Paz', h: 'Subarctic highland. World\'s highest administrative capital, Bolivia.' },
  // ── Europe ─────────────────────────────────────────────────────────────
  { lat: 48.8637, lng: 2.3308,  head: 90,  name: 'Rue de Rivoli, Paris', h: 'Temperate. Long arcaded street near the Tuileries, France.' },
  { lat: 51.5055, lng: -0.0754, head: 270, name: 'Tower Bridge Road, London', h: 'Temperate oceanic. Victorian bridge in the British capital.' },
  { lat: 52.5157, lng: 13.3777, head: 90,  name: 'Unter den Linden, Berlin', h: 'Temperate. Tree-lined boulevard through Germany\'s capital.' },
  { lat: 40.4155, lng: -3.7074, head: 0,   name: 'Gran Vía, Madrid', h: 'Mediterranean. Grand early-20th-century boulevard in Spain.' },
  { lat: 41.3995, lng: 2.1990,  head: 180, name: 'La Rambla, Barcelona', h: 'Mediterranean. Famous tree-lined promenade in Catalonia.' },
  { lat: 41.8933, lng: 12.4830, head: 90,  name: 'Via Cavour, Rome', h: 'Mediterranean. Ancient city road near the Colosseum, Italy.' },
  { lat: 52.3728, lng: 4.8948,  head: 180, name: 'Damrak, Amsterdam', h: 'Temperate. Canal-lined main street in the Netherlands.' },
  { lat: 48.2082, lng: 16.3695, head: 0,   name: 'Ringstraße, Vienna', h: 'Temperate. Imperial boulevard around Austria\'s capital.' },
  { lat: 47.3769, lng: 8.5391,  head: 90,  name: 'Bahnhofstrasse, Zurich', h: 'Temperate. Elegant shopping street in Switzerland.' },
  { lat: 45.4654, lng: 9.1914,  head: 270, name: 'Corso Buenos Aires, Milan', h: 'Temperate. Long shopping avenue in northern Italy.' },
  { lat: 38.7099, lng: -9.1395, head: 90,  name: 'Avenida da Liberdade, Lisbon', h: 'Mediterranean. Leafy grand avenue of Portugal\'s capital.' },
  { lat: 50.8462, lng: 4.3523,  head: 0,   name: 'Rue de la Loi, Brussels', h: 'Temperate. EU quarter street in the Belgian capital.' },
  { lat: 55.7522, lng: 37.6156, head: 90,  name: 'Tverskaya Street, Moscow', h: 'Continental. Main artery of the Russian capital.' },
  { lat: 59.9293, lng: 30.3187, head: 270, name: 'Nevsky Prospect, St Petersburg', h: 'Subarctic. Grand 18th-century boulevard in Russia.' },
  { lat: 50.0874, lng: 14.4213, head: 180, name: 'Wenceslas Square, Prague', h: 'Temperate continental. Historic boulevard in the Czech capital.' },
  { lat: 47.4979, lng: 19.0402, head: 90,  name: 'Andrássy Avenue, Budapest', h: 'Temperate. UNESCO-listed boulevard in Hungary.' },
  { lat: 59.3337, lng: 18.0620, head: 180, name: 'Drottninggatan, Stockholm', h: 'Subarctic. Pedestrian street in the Swedish capital.' },
  { lat: 55.6786, lng: 12.5689, head: 270, name: 'Strøget, Copenhagen', h: 'Temperate. One of Europe\'s longest pedestrian streets, Denmark.' },
  { lat: 60.1711, lng: 24.9414, head: 90,  name: 'Mannerheimintie, Helsinki', h: 'Subarctic. Main boulevard of the Finnish capital.' },
  { lat: 59.9152, lng: 10.7520, head: 0,   name: 'Karl Johans gate, Oslo', h: 'Subarctic. Royal palace avenue in Norway\'s capital.' },
  { lat: 37.9755, lng: 23.7348, head: 270, name: 'Ermou Street, Athens', h: 'Mediterranean. Pedestrian shopping street in Greece\'s capital.' },
  { lat: 50.0622, lng: 19.9390, head: 180, name: 'Floriańska, Kraków', h: 'Temperate continental. Medieval street in southern Poland.' },
  { lat: 42.6977, lng: 23.3219, head: 90,  name: 'Vitosha Boulevard, Sofia', h: 'Continental. Main pedestrian street of Bulgaria\'s capital.' },
  { lat: 44.8176, lng: 20.4619, head: 0,   name: 'Knez Mihailova, Belgrade', h: 'Continental. Pedestrian thoroughfare in Serbia\'s capital.' },
  { lat: 45.8150, lng: 15.9819, head: 270, name: 'Ilica, Zagreb', h: 'Continental. Main street of Croatia\'s capital.' },
  { lat: 55.9508, lng: -3.1878, head: 90,  name: 'Royal Mile, Edinburgh', h: 'Temperate. Historic street from the castle to Holyrood, Scotland.' },
  // ── Middle East ────────────────────────────────────────────────────────
  { lat: 25.1971, lng: 55.2730, head: 0,   name: 'Sheikh Mohammed Bin Rashid Blvd, Dubai', h: 'Desert. Ultra-modern boulevard near the Burj Khalifa, UAE.' },
  { lat: 41.0082, lng: 28.9783, head: 270, name: 'İstiklal Avenue, Istanbul', h: 'Mediterranean. Busy pedestrian street in Turkey\'s largest city.' },
  { lat: 30.0444, lng: 31.2357, head: 90,  name: 'Tahrir Square area, Cairo', h: 'Desert. Heart of Egypt\'s sprawling capital.' },
  { lat: 33.8945, lng: 35.4946, head: 180, name: 'Hamra Street, Beirut', h: 'Mediterranean. Cultural street in Lebanon\'s capital.' },
  { lat: 31.9522, lng: 35.9270, head: 90,  name: 'Rainbow Street, Amman', h: 'Mediterranean. Lively street in Jordan\'s hilltop capital.' },
  { lat: 24.7136, lng: 46.6753, head: 180, name: 'Olaya Street, Riyadh', h: 'Desert. Commercial spine of Saudi Arabia\'s capital.' },
  // ── Africa ─────────────────────────────────────────────────────────────
  { lat: -33.9186, lng: 18.4233, head: 0,   name: 'Long Street, Cape Town', h: 'Mediterranean. Vibrant bar and café strip in South Africa.' },
  { lat: -26.1952, lng: 28.0343, head: 90,  name: 'Sandton City, Johannesburg', h: 'Subtropical. Africa\'s richest square kilometre, South Africa.' },
  { lat: -1.2834,  lng: 36.8155, head: 270, name: 'Kenyatta Avenue, Nairobi', h: 'Equatorial highland. Capital boulevard of Kenya.' },
  { lat: 33.5930, lng: -7.6190, head: 180, name: 'Boulevard Zerktouni, Casablanca', h: 'Mediterranean. Modern commercial street in Morocco.' },
  { lat: 36.8069, lng: 10.1813, head: 90,  name: 'Avenue Habib Bourguiba, Tunis', h: 'Mediterranean. Tree-lined central avenue in Tunisia\'s capital.' },
  { lat: 5.3543,  lng: -4.0014, head: 0,   name: 'Plateau, Abidjan', h: 'Tropical. Business district in Côte d\'Ivoire.' },
  { lat: 6.4541,  lng: 3.3947,  head: 90,  name: 'Victoria Island, Lagos', h: 'Tropical. Commercial district in Nigeria\'s largest city.' },
  { lat: 9.0227,  lng: 38.7467, head: 270, name: 'Bole Road, Addis Ababa', h: 'Subtropical highland. Capital of Ethiopia.' },
  // ── South & Central Asia ───────────────────────────────────────────────
  { lat: 28.6315, lng: 77.2167, head: 90,  name: 'Connaught Place, New Delhi', h: 'Subtropical. Colonial circular market in India\'s capital.' },
  { lat: 19.0822, lng: 72.8816, head: 270, name: 'Marine Drive, Mumbai', h: 'Tropical. Crescent-shaped seafront boulevard in India.' },
  { lat: 12.9761, lng: 77.6000, head: 0,   name: 'MG Road, Bangalore', h: 'Subtropical. IT capital\'s commercial spine in India.' },
  { lat: 27.7074, lng: 85.3155, head: 180, name: 'Thamel, Kathmandu', h: 'Subtropical highland. Tourist hub of Nepal\'s capital.' },
  { lat: 6.9150,  lng: 79.8730, head: 90,  name: 'Galle Road, Colombo', h: 'Tropical. Coastal road in Sri Lanka\'s commercial capital.' },
  { lat: 23.7272, lng: 90.4093, head: 0,   name: 'Gulshan, Dhaka', h: 'Tropical. Diplomatic and commercial district in Bangladesh.' },
  // ── East & Southeast Asia ──────────────────────────────────────────────
  { lat: 35.6809, lng: 139.6900, head: 0,   name: 'Shibuya, Tokyo', h: 'Temperate. One of the world\'s busiest crossings in Japan.' },
  { lat: 35.0116, lng: 135.7662, head: 90,  name: 'Shijo-dori, Kyoto', h: 'Temperate. Historic commercial street in Japan\'s old capital.' },
  { lat: 34.6687, lng: 135.5024, head: 0,   name: 'Dotonbori, Osaka', h: 'Temperate. Neon-lit entertainment canal district in Japan.' },
  { lat: 37.5665, lng: 126.9800, head: 90,  name: 'Myeongdong, Seoul', h: 'Temperate. Major shopping district in South Korea.' },
  { lat: 25.0423, lng: 121.5271, head: 270, name: 'Ximending, Taipei', h: 'Subtropical. Pedestrian shopping district in Taiwan.' },
  { lat: 22.2794, lng: 114.1629, head: 0,   name: 'Nathan Road, Hong Kong', h: 'Subtropical. The "Golden Mile" of Kowloon.' },
  { lat: 31.2231, lng: 121.4890, head: 90,  name: 'Nanjing Road, Shanghai', h: 'Subtropical. China\'s most famous shopping street.' },
  { lat: 39.9242, lng: 116.4372, head: 180, name: 'Wangfujing, Beijing', h: 'Temperate continental. Historic pedestrian street in China\'s capital.' },
  { lat: 1.2942,  lng: 103.8517, head: 270, name: 'Orchard Road, Singapore', h: 'Equatorial. Shopping boulevard of the city-state.' },
  { lat: 13.7434, lng: 100.5014, head: 0,   name: 'Silom Road, Bangkok', h: 'Tropical. Financial and nightlife district in Thailand\'s capital.' },
  { lat: 21.0285, lng: 105.8542, head: 90,  name: 'Hoan Kiem, Hanoi', h: 'Subtropical. Lake district in Vietnam\'s capital.' },
  { lat: 10.7758, lng: 106.7025, head: 270, name: 'Đồng Khởi, Ho Chi Minh City', h: 'Tropical. French-era boulevard in southern Vietnam.' },
  { lat: 3.1494,  lng: 101.7028, head: 0,   name: 'KLCC, Kuala Lumpur', h: 'Equatorial. Twin towers district in Malaysia.' },
  { lat: 14.5832, lng: 120.9806, head: 90,  name: 'Roxas Boulevard, Manila', h: 'Tropical. Seafront drive of the Philippine capital.' },
  { lat: -6.1753,  lng: 106.8272, head: 180, name: 'Sudirman, Jakarta', h: 'Equatorial. Main business corridor of Indonesia\'s capital.' },
  // ── Oceania ────────────────────────────────────────────────────────────
  { lat: -33.8679, lng: 151.2073, head: 270, name: 'George Street, Sydney', h: 'Temperate. CBD spine of Australia\'s largest city.' },
  { lat: -37.8183, lng: 144.9671, head: 90,  name: 'Swanston Street, Melbourne', h: 'Temperate oceanic. Tram-lined artery of Victoria\'s capital.' },
  { lat: -27.4698, lng: 153.0251, head: 0,   name: 'Queen Street Mall, Brisbane', h: 'Subtropical. Pedestrian mall in Queensland\'s capital.' },
  { lat: -31.9505, lng: 115.8590, head: 90,  name: 'Hay Street Mall, Perth', h: 'Mediterranean. Shopping street in Western Australia.' },
  { lat: -36.8484, lng: 174.7633, head: 270, name: 'Queen Street, Auckland', h: 'Temperate oceanic. Main street of New Zealand\'s largest city.' },
  { lat: -43.5321, lng: 172.6362, head: 0,   name: 'Cashel Street, Christchurch', h: 'Temperate. Rebuilt post-earthquake pedestrian mall in New Zealand.' },
];

// Track used indices to prevent repeats within a session.
// Resets automatically once all locations have been seen.
const _used = new Set<number>();

export function randomLandLocation(): Location {
  if (_used.size >= LOCATIONS.length) _used.clear();
  let idx: number;
  do { idx = Math.floor(Math.random() * LOCATIONS.length); } while (_used.has(idx));
  _used.add(idx);
  const l = LOCATIONS[idx];
  return { lat: l.lat, lng: l.lng, head: l.head, name: l.name, h: l.h };
}

export function locationFromCoords(lat: number, lng: number, head?: number): Location {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  const coord = `${Math.abs(lat).toFixed(3)}°${ns}, ${Math.abs(lng).toFixed(3)}°${ew}`;
  const a = Math.abs(lat);
  const climate =
    a < 10   ? 'Equatorial — dense tropical rainforest, year-round heat' :
    a < 23.5 ? 'Tropical — wet and dry seasons, lush vegetation' :
    a < 35   ? 'Subtropical — warm and dry, Mediterranean or desert character' :
    a < 55   ? 'Temperate — four seasons, mixed or deciduous forest' :
    a < 68   ? 'Subarctic / boreal — long cold winters, conifer forest or tundra' :
               'Polar / arctic — permafrost, sparse vegetation, extreme cold';
  return {
    lat,
    lng,
    head: head ?? Math.floor(Math.random() * 360),
    name: coord,
    h: `${lat >= 0 ? 'Northern' : 'Southern'} hemisphere. ${climate}. Coordinates: ${coord}.`,
  };
}
