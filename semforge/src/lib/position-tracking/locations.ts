export interface TrackingLocation {
  key: string;
  countryCode: "KR" | "US" | "JP" | "GB" | "DE";
  languageCode: string;
  country: string;
  city: string;
  label: string;
  latitude: number;
  longitude: number;
  /** TalorData Google location/uule 에 전달할 검증된 canonical location 값. */
  googleLocation: string;
  googleUule: string;
  aliases: string[];
}

/**
 * 런타임 지오코딩 없이 운영하는 제한된 위치 카탈로그.
 * UULE 은 canonical city 문자열을 Google UULE 규격으로 인코딩한 값이다.
 */
function uule(canonicalName: string): string {
  const bytes = new TextEncoder().encode(canonicalName);
  const lengthAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  if (bytes.length >= lengthAlphabet.length) {
    throw new Error(`UULE 위치명이 너무 깁니다: ${canonicalName}`);
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `w+CAIQICI${lengthAlphabet[bytes.length]}${btoa(binary).replace(/=+$/, "")}`;
}

const RAW_LOCATIONS: Omit<TrackingLocation, "googleUule">[] = [
  { key: "KR-SEOUL", countryCode: "KR", languageCode: "ko", country: "South Korea", city: "Seoul", label: "Seoul, South Korea", latitude: 37.5665, longitude: 126.978, googleLocation: "Seoul,South Korea", aliases: ["서울", "대한민국", "korea", "south korea", "seoul"] },
  { key: "KR-BUSAN", countryCode: "KR", languageCode: "ko", country: "South Korea", city: "Busan", label: "Busan, South Korea", latitude: 35.1796, longitude: 129.0756, googleLocation: "Busan,South Korea", aliases: ["부산", "busan"] },
  { key: "KR-INCHEON", countryCode: "KR", languageCode: "ko", country: "South Korea", city: "Incheon", label: "Incheon, South Korea", latitude: 37.4563, longitude: 126.7052, googleLocation: "Incheon,South Korea", aliases: ["인천", "incheon"] },
  { key: "KR-DAEGU", countryCode: "KR", languageCode: "ko", country: "South Korea", city: "Daegu", label: "Daegu, South Korea", latitude: 35.8714, longitude: 128.6014, googleLocation: "Daegu,South Korea", aliases: ["대구", "daegu"] },
  { key: "US-NEW-YORK", countryCode: "US", languageCode: "en", country: "United States", city: "New York", label: "New York, United States", latitude: 40.7128, longitude: -74.006, googleLocation: "New York,New York,United States", aliases: ["뉴욕", "new york", "nyc", "united states", "usa"] },
  { key: "US-LOS-ANGELES", countryCode: "US", languageCode: "en", country: "United States", city: "Los Angeles", label: "Los Angeles, United States", latitude: 34.0522, longitude: -118.2437, googleLocation: "Los Angeles,California,United States", aliases: ["로스앤젤레스", "los angeles", "la"] },
  { key: "US-CHICAGO", countryCode: "US", languageCode: "en", country: "United States", city: "Chicago", label: "Chicago, United States", latitude: 41.8781, longitude: -87.6298, googleLocation: "Chicago,Illinois,United States", aliases: ["시카고", "chicago"] },
  { key: "US-SAN-FRANCISCO", countryCode: "US", languageCode: "en", country: "United States", city: "San Francisco", label: "San Francisco, United States", latitude: 37.7749, longitude: -122.4194, googleLocation: "San Francisco,California,United States", aliases: ["샌프란시스코", "san francisco", "sf"] },
  { key: "JP-TOKYO", countryCode: "JP", languageCode: "ja", country: "Japan", city: "Tokyo", label: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503, googleLocation: "Tokyo,Japan", aliases: ["도쿄", "東京", "tokyo", "japan"] },
  { key: "JP-OSAKA", countryCode: "JP", languageCode: "ja", country: "Japan", city: "Osaka", label: "Osaka, Japan", latitude: 34.6937, longitude: 135.5023, googleLocation: "Osaka,Japan", aliases: ["오사카", "大阪", "osaka"] },
  { key: "JP-YOKOHAMA", countryCode: "JP", languageCode: "ja", country: "Japan", city: "Yokohama", label: "Yokohama, Japan", latitude: 35.4437, longitude: 139.638, googleLocation: "Yokohama,Japan", aliases: ["요코하마", "横浜", "yokohama"] },
  { key: "JP-NAGOYA", countryCode: "JP", languageCode: "ja", country: "Japan", city: "Nagoya", label: "Nagoya, Japan", latitude: 35.1815, longitude: 136.9066, googleLocation: "Nagoya,Japan", aliases: ["나고야", "名古屋", "nagoya"] },
  { key: "GB-LONDON", countryCode: "GB", languageCode: "en", country: "United Kingdom", city: "London", label: "London, United Kingdom", latitude: 51.5074, longitude: -0.1278, googleLocation: "London,England,United Kingdom", aliases: ["런던", "london", "united kingdom", "uk"] },
  { key: "GB-MANCHESTER", countryCode: "GB", languageCode: "en", country: "United Kingdom", city: "Manchester", label: "Manchester, United Kingdom", latitude: 53.4808, longitude: -2.2426, googleLocation: "Manchester,England,United Kingdom", aliases: ["맨체스터", "manchester"] },
  { key: "GB-BIRMINGHAM", countryCode: "GB", languageCode: "en", country: "United Kingdom", city: "Birmingham", label: "Birmingham, United Kingdom", latitude: 52.4862, longitude: -1.8904, googleLocation: "Birmingham,England,United Kingdom", aliases: ["버밍엄", "birmingham"] },
  { key: "GB-EDINBURGH", countryCode: "GB", languageCode: "en", country: "United Kingdom", city: "Edinburgh", label: "Edinburgh, United Kingdom", latitude: 55.9533, longitude: -3.1883, googleLocation: "Edinburgh,Scotland,United Kingdom", aliases: ["에든버러", "edinburgh"] },
  { key: "DE-BERLIN", countryCode: "DE", languageCode: "de", country: "Germany", city: "Berlin", label: "Berlin, Germany", latitude: 52.52, longitude: 13.405, googleLocation: "Berlin,Germany", aliases: ["베를린", "berlin", "germany", "deutschland"] },
  { key: "DE-MUNICH", countryCode: "DE", languageCode: "de", country: "Germany", city: "Munich", label: "Munich, Germany", latitude: 48.1351, longitude: 11.582, googleLocation: "Munich,Bavaria,Germany", aliases: ["뮌헨", "munich", "münchen"] },
  { key: "DE-HAMBURG", countryCode: "DE", languageCode: "de", country: "Germany", city: "Hamburg", label: "Hamburg, Germany", latitude: 53.5511, longitude: 9.9937, googleLocation: "Hamburg,Germany", aliases: ["함부르크", "hamburg"] },
  { key: "DE-FRANKFURT", countryCode: "DE", languageCode: "de", country: "Germany", city: "Frankfurt", label: "Frankfurt, Germany", latitude: 50.1109, longitude: 8.6821, googleLocation: "Frankfurt,Hesse,Germany", aliases: ["프랑크푸르트", "frankfurt"] },
];

export const TRACKING_LOCATIONS: TrackingLocation[] = RAW_LOCATIONS.map((location) => ({
  ...location,
  googleUule: uule(location.googleLocation),
}));

export function getTrackingLocation(key: string): TrackingLocation | null {
  return TRACKING_LOCATIONS.find((location) => location.key === key) ?? null;
}

export function defaultTrackingLocation(domain: string): TrackingLocation {
  return getTrackingLocation(domain.toLowerCase().endsWith(".kr") ? "KR-SEOUL" : "US-NEW-YORK")!;
}

export function searchTrackingLocations(query: string): TrackingLocation[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return TRACKING_LOCATIONS;
  return TRACKING_LOCATIONS.filter((location) =>
    [location.label, location.city, location.country, location.countryCode, ...location.aliases]
      .some((value) => value.toLocaleLowerCase().includes(normalized))
  );
}
