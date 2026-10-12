// Registry of Trends source providers, run in order by the ingestion function.
// Adding a source (e.g. Apify social ingestion in Phase 1) means adding one module here.
import { anthropicProvider } from "./anthropic.ts";
import { arxivProvider } from "./arxiv.ts";
import { hackerNewsProvider } from "./hackernews.ts";
import { githubProvider } from "./github.ts";
import { rssProvider } from "./rss.ts";

export const PROVIDERS = [arxivProvider, hackerNewsProvider, githubProvider, rssProvider, anthropicProvider];