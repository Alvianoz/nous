import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("AIzaSyDvNjhCuhjPL-h-vb0Vh4hZy1d58CRANw8");

async function listModels() {
  try {
    const models = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyDvNjhCuhjPL-h-vb0Vh4hZy1d58CRANw8`);
    const json = await models.json();
    console.log(json.models.map(m => m.name).join("\n"));
  } catch (e) {
    console.error(e);
  }
}

listModels();
