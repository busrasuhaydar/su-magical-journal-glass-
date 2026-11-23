// Tatil verisi bulunan ülkelerin Türkçe adları ve bayrakları.
export const COUNTRY_NAMES: Record<string, string> = {
  TR: 'Türkiye', US: 'Amerika Birleşik Devletleri', AD: 'Andorra', AL: 'Arnavutluk', AT: 'Avusturya', AX: 'Åland Adaları',
  BA: 'Bosna-Hersek', BE: 'Belçika', BG: 'Bulgaristan', BY: 'Belarus', CH: 'İsviçre', CY: 'Kıbrıs', CZ: 'Çekya',
  DE: 'Almanya', DK: 'Danimarka', EE: 'Estonya', ES: 'İspanya', FI: 'Finlandiya', FO: 'Faroe Adaları', FR: 'Fransa',
  GB: 'Birleşik Krallık', GG: 'Guernsey', GI: 'Cebelitarık', GR: 'Yunanistan', HR: 'Hırvatistan', HU: 'Macaristan',
  IE: 'İrlanda', IM: 'Man Adası', IS: 'İzlanda', IT: 'İtalya', JE: 'Jersey', LI: 'Lihtenştayn', LT: 'Litvanya',
  LU: 'Lüksemburg', LV: 'Letonya', MC: 'Monako', MD: 'Moldova', ME: 'Karadağ', MK: 'Kuzey Makedonya', MT: 'Malta',
  NL: 'Hollanda', NO: 'Norveç', PL: 'Polonya', PT: 'Portekiz', RO: 'Romanya', RS: 'Sırbistan', RU: 'Rusya', SE: 'İsveç',
  SI: 'Slovenya', SJ: 'Svalbard', SK: 'Slovakya', SM: 'San Marino', UA: 'Ukrayna', VA: 'Vatikan',
};
export const countryName = (cc: string) => COUNTRY_NAMES[cc] ?? cc;
export const flag = (cc: string) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
export const ALL_COUNTRIES = Object.keys(COUNTRY_NAMES).sort((a, b) =>
  a === 'TR' ? -1 : b === 'TR' ? 1 : countryName(a).localeCompare(countryName(b), 'tr'));
