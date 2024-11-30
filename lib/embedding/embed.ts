// import { Embedding } from "ai";
// import axios from "axios";

// export async function getEmbedding(
//   query: string
// ): Promise<Embedding | undefined> {
//   const API_URL =
//     "https://api-inference.huggingface.co/models/sentence-transformers/all-mpnet-base-v2";

//   const data = { inputs: query };
//   console.log('data:', data)
//   try {
//     const response = await axios.post(API_URL, data, {
//       headers: {
//         Authorization: `Bearer ${process.env.HUGGING_FACE_ACCESS_TOKEN}`,
//         "Content-Type": "application/json",
//         "x-wait-for-model": true,
//       },
//     });
//     console.log("Embedding:", response.data);
//     return response.data as Embedding;
//   } catch (error: any) {
//     console.error(
//       "Error when embedding with HF sentence-transformers:",
//       error.response?.data || error.message
//     );
//   }
// }


import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/embeddings";

/**
 * Get embeddings for a given text using OpenAI's embedding model.
 * @param text The input text to embed.
 * @returns Promise<number[] | undefined> A promise that resolves to the embedding vector or undefined if an error occurs.
 */
export async function getEmbedding(text: string): Promise<number[] | undefined> {
  if (!OPENAI_API_KEY) {
    console.error("OpenAI API key is missing. Set it in your .env file.");
    return;
  }

  try {
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: "text-embedding-3-small",
        input: text,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    // Extract embedding data
    const embedding = response.data.data[0].embedding;
    return embedding;
  } catch (error: any) {
    console.error("Error fetching embedding:", error.response?.data || error.message);
  }
}
