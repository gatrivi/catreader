import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: API_KEY });

async function main() {
  try {
    const result = await genAI.models.list();
    console.log("Raw Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error listing models:", err);
  }
}

main();
