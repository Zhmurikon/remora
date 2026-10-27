import { blogMetadata, loadPublishedPosts } from '../../lib/blog';
import { BlogIndexPage } from './BlogIndexPage';

export const metadata = blogMetadata();

export default async function BlogPage() {
  return <BlogIndexPage posts={await loadPublishedPosts()} includeStructuredData />;
}
