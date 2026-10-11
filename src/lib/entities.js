// Named things the feed watches for, so records from different sources that are
// about the same model, tool or technique can be grouped together.
//
// This list only says which names to look for. A grouping is never asserted from
// the list alone: a name is listed in the Trending Today section only when two or
// more stored records, from two or more different sources, actually mention it.

const def = (name, source) => ({ name, pattern: new RegExp(source, "i") });

export const ENTITIES = [
  def("GPT", "\\bgpt(-\\d[\\w.]*)?\\b|\\bchatgpt\\b"),
  def("Claude", "\\bclaude\\b"),
  def("Gemini", "\\bgemini\\b"),
  def("Llama", "\\bllama\\b"),
  def("Mistral", "\\bmistral\\b"),
  def("Qwen", "\\bqwen\\b"),
  def("DeepSeek", "\\bdeepseek\\b"),
  def("Grok", "\\bgrok\\b"),
  def("Gemma", "\\bgemma\\b"),
  def("Phi", "\\bphi-\\d"),
  def("Kimi", "\\bkimi\\b"),
  def("Sora", "\\bsora\\b"),
  def("Veo", "\\bveo\\b"),
  def("Flux", "\\bflux\\b"),
  def("Midjourney", "\\bmidjourney\\b"),
  def("Runway", "\\brunway\\b"),
  def("Whisper", "\\bwhisper\\b"),
  def("MCP", "\\bmodel context protocol\\b|\\bmcp\\b"),
  def("LangGraph", "\\blanggraph\\b"),
  def("CrewAI", "\\bcrewai\\b"),
  def("vLLM", "\\bvllm\\b"),
  def("Ollama", "\\bollama\\b"),
  def("RAG", "\\brag\\b|retrieval-augmented"),
  def("RLHF", "\\brlhf\\b"),
  def("LoRA", "\\blora\\b|\\bqlora\\b"),
  def("GGUF", "\\bgguf\\b"),
  def("SWE-bench", "\\bswe-bench\\b"),
  def("MMLU", "\\bmmlu\\b|\\bmmmu\\b"),
  def("Copilot", "\\bcopilot\\b"),
  def("PyTorch", "\\bpytorch\\b"),
  def("Transformers", "\\btransformers\\b"),
  def("CUDA", "\\bcuda\\b"),
];

// Every name that a record mentions, from its title and its own summary.
export function entityNames(item) {
  const haystack = `${item.title || ""} ${item.excerpt || ""}`;
  return ENTITIES.filter((entity) => entity.pattern.test(haystack)).map((entity) => entity.name);
}