import MediaCard from "./MediaCard";
import RepositoryCard from "./RepositoryCard";
import ArticleCard from "./ArticleCard";
import TextPostCard from "./TextPostCard";

export default function ItemCard({ item, context }) {
  if (item.format === "project") return <RepositoryCard item={item} context={context} />;
  if (item.format === "video") return <MediaCard item={item} context={context} />;
  if (item.format === "post") return <TextPostCard item={item} context={context} />;
  return <ArticleCard item={item} context={context} />;
}