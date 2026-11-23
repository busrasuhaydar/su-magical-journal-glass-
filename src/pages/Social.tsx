import { PageHead } from '../components/Shell';
import { PostList } from '../components/PostList';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEditors } from '../components/Editors';
import { usePosts } from '../lib/data';

export default function SocialPage() {
  const posts = usePosts();
  const [params, setParams] = useSearchParams();
  const { openPost } = useEditors();
  const target = params.get('icerik');
  useEffect(() => {
    const p = target && posts.data?.find((x) => x.id === target);
    if (p) { openPost(p); setParams({}, { replace: true }); }
  }, [target, posts.data, openPost, setParams]);
  return (
    <>
      <PageHead title="Sosyal Medya" />
      <p className="small muted" style={{ margin: 0 }}>Projelerden oluşturulan içerikler de burada. Her içerik tek bir kayıttır; takvimde, günlük sayfada ve projenin kendi sekmesinde aynı kayıt görünür.</p>
      <section className="glass panel"><PostList posts={posts.data ?? []} loading={posts.isLoading} /></section>
    </>
  );
}
