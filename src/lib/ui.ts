// Ana sayfa özelleştirmesi (profiles.ui_prefs): kart başlıkları, göster/gizle, Boston saati. Cihazlar arasında eşitlenir.
import { useProfile } from './data';

export interface UiPrefs { titles?: Record<string, string>; hide?: string[]; boston?: boolean }
export const HOME_SECTIONS: [string, string][] = [
  ['plan', 'Bugünün planı'], ['routines', 'Hatırlatmalar'], ['todo', 'Yapılacaklar'], ['art', 'Günün eseri'], ['ideas', 'Aklımdakiler'],
  ['week', 'Bu hafta'], ['upcoming', 'Yaklaşanlar'], ['social', 'Sosyal Medya'], ['projects', 'Projelerim'],
];
export function useHomePrefs() {
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  return {
    ui,
    title: (k: string, d: string) => ui.titles?.[k]?.trim() || d,
    visible: (k: string) => !(ui.hide ?? []).includes(k),
    boston: ui.boston !== false,
  };
}
export const bostonTime = (d: Date) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
export const bostonDay = (d: Date) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'America/New_York', weekday: 'short' }).format(d);
