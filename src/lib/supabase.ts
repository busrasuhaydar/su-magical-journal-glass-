import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !anon) throw new Error('Supabase ayarları eksik: .env dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY olmalı.');

export const supabase = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });

/** Supabase hatasını kullanıcıya gösterilecek Türkçe mesaja çevirir. */
export function errText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(msg)) return 'E-posta veya şifre hatalı.';
  if (/Email not confirmed/i.test(msg)) return 'E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın.';
  if (/User already registered/i.test(msg)) return 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.';
  if (/Password should be at least/i.test(msg)) return 'Şifre en az 6 karakter olmalı.';
  if (/rate limit/i.test(msg)) return 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';
  if (/duplicate key/i.test(msg)) return 'Bu kayıt zaten var.';
  if (/check constraint/i.test(msg)) return 'Girilen değerlerden biri geçersiz (ör. bitiş saati başlangıçtan önce olamaz).';
  return `Bir hata oluştu: ${msg}`;
}

export async function sha256(file: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function slugify(s: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', é: 'e', â: 'a', î: 'i', û: 'u' };
  return s.toLocaleLowerCase('tr').replace(/[çğıöşüéâîû]/g, (c) => map[c] ?? c).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proje';
}
