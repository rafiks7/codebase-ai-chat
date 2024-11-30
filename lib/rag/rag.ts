import { Pinecone } from "@pinecone-database/pinecone";
import { Embedding } from "ai";

// ... existing code ...
const apiKey = process.env.PINECONE_API_KEY;

if (!apiKey) {
  throw new Error("PINECONE_API_KEY is not defined");
}

const pc = new Pinecone({ apiKey });

export async function getContext(queryEmbedding: Embedding, query: string, repo_url: string) {
  console.log('getContext function here!!!')
    const index = pc.index("codebase-rag").namespace(repo_url);

    const top_matches = await index.query({
        topK: 5,
        includeMetadata: true,
        vector: queryEmbedding,
    })

    console.log('top matches:', top_matches)

    const contexts = top_matches.matches.map((item: any) => item.metadata.text);

    console.log('contexts: ', contexts)

    const augmented_query = "<CONTEXT>\n" + contexts.slice(0, 10).join("\n\n-------\n\n") + "\n-------\n</CONTEXT>\n\n\n\nMY QUESTION:\n" + query;

    console.log('augmented query: ', augmented_query)

    return augmented_query;
}
