import { GoogleGenAI } from 'https://esm.sh/@google/genai';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let apiKey = localStorage.getItem('gemini_api_key') || '';
let pdfContext = '';
let chatSession = null;

const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const startBtn = document.getElementById('start-btn');
const configSection = document.getElementById('config-section');
const chatSection = document.getElementById('chat-section');
const chatBox = document.getElementById('chat-box');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const statusBadge = document.getElementById('status-badge');
const metrics = document.getElementById('metrics');
const ttftVal = document.getElementById('ttft-val');
const totalVal = document.getElementById('total-val');

if (apiKey) {
  apiKeyInput.value = apiKey;
}

async function loadEmbeddedPDF() {
  try {
    const response = await fetch('contexto.pdf');
    if (!response.ok) throw new Error("No se encontró 'public/contexto.pdf'");
    
    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    pdfContext = fullText;
    statusBadge.textContent = 'PDF Cargado ✓';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    checkReadyToStart();

  } catch (err) {
    statusBadge.textContent = 'Error al cargar PDF';
    statusBadge.className = 'px-3 py-1 text-xs rounded-full bg-red-500/10 text-red-400 border border-red-500/20';
    console.error(err);
  }
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return alert('Ingresa una API Key válida.');
  apiKey = key;
  localStorage.setItem('gemini_api_key', apiKey);
  alert('API Key guardada.');
  checkReadyToStart();
});

function checkReadyToStart() {
  if (apiKey && pdfContext) {
    startBtn.disabled = false;
  }
}

startBtn.addEventListener('click', async () => {
  try {
    const ai = new GoogleGenAI({ apiKey });

    // System instruction estructurado para forzar respuestas ordenadas con Markdown
    const systemInstruction = `
      You are a professional English recruiter from top tech companies (e.g., Google, NVIDIA, Apple, Microsoft, Amazon, Zapier, GitLab, GitHub).
      You are searching for a Semi-Senior or Junior developer for a remote job (Front-end, Back-end, or Full-stack). 
      You are testing their SOFT, HARD, and ENGLISH communication skills.
      
      Use the following JOB DESCRIPTION as context: ${pdfContext}
      
      ROLE & GOAL:
      Conduct a realistic, interactive mock technical interview in English. 
      Adapt your evaluation to the candidate's level (Junior/Semi-Senior), but gently push their English usage toward a professional corporate level (B2/C1).
      The first mesagge that the user sends you is automatic response so you can start the interview.

      OUTPUT FORMATTING RULES (STRICT):
      1. DO NOT return dense walls or monoliths of text. Keep sentences short, direct, sharp, and dynamic.
      2. Use Markdown formatting heavily to make answers highly scannable:
         - **Bold** key terms, core technologies, and critical metrics.
         - Use bullet points (* or -) for actionable advice, grammar corrections, or lists.
         - Separate sections with a horizontal rule (---).
      3. For every ongoing user response, you MUST structure your answer into exactly two distinct sections. Never merge them:
         
         ### 🎯 Feedback & Corrections
         - Evaluate the user's previous answer (Grammar, Vocabulary, Tone, and Clarity).
         - Highlight mistakes or weak phrasing in **bold** and suggest professional alternatives in *italics*.
         - Give a brief, actionable tip on how a tech recruiter prefers to hear that specific point.
         
         ---
         
         ### 💬 Next Question
         - Ask exactly **ONE** clear, well-structured interview question.
         - Alternate logically between soft skills, technical scenarios, and past experience based on the job description. Do not ask multiple questions at once.
      
      4. END OF THE INTERVIEW EXCEPTION:
         When you decide to end the interview, DO NOT use the "Next Question" section. Instead, structure your final response using this exact format:
         
         ### 🏁 Interview Wrap-Up & Final Score
         - Provide a concise summary of the candidate's overall performance.
         - Give an approximate English level observed (e.g., B1, B2, C1) and a tech readiness assessment.
         
         ---
         
         ### 📊 Comprehensive Feedback Report
         - Group the overall grammar corrections, vocabulary improvements, and soft/hard skill advice into distinct, bulleted categories.
         - End with a motivating closing statement from a recruiter's perspective.
    `;

    chatSession = ai.chats.create({
      model: 'gemini-3.5-flash',
      config: { systemInstruction }
    });

    configSection.classList.add('hidden');
    chatSection.classList.remove('hidden');

    await sendMessage("Hello! I am ready to start the interview.");
  } catch (err) {
    alert("Error al iniciar con Gemini API: " + err.message);
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = '';
  appendMessage('user', text);
  await sendMessage(text);
});

async function sendMessage(text) {
  const messageElement = appendMessage('model', '');
  const startTime = performance.now();
  let firstTokenTime = null;

  try {
    const responseStream = await chatSession.sendMessageStream({ message: text });

    let fullText = '';
    for await (const chunk of responseStream) {
      if (!firstTokenTime) {
        firstTokenTime = performance.now();
      }
      fullText += chunk.text;
      
      // Parsear Markdown dinámicamente durante el streaming
      messageElement.innerHTML = marked.parse(fullText);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    const endTime = performance.now();
    
    const ttft = firstTokenTime ? ((firstTokenTime - startTime) / 1000).toFixed(2) : 0;
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    metrics.classList.remove('hidden');
    ttftVal.textContent = `${ttft} s`;
    totalVal.textContent = `${totalTime} s`;

  } catch (err) {
    messageElement.textContent = `Error: ${err.message}`;
  }
}

function appendMessage(sender, text) {
  const msgDiv = document.createElement('div');
  const bubble = document.createElement('div');
  
  if (sender === 'user') {
    msgDiv.className = 'flex justify-end';
    bubble.className = 'bg-indigo-600 text-white rounded-xl py-3 px-4 max-w-[85%] prose prose-invert text-sm';
    bubble.textContent = text;
  } else {
    msgDiv.className = 'flex justify-start';
    // Clases 'prose' de Tailwind para estilizar Markdown automáticamente (listas, títulos, negritas)
    bubble.className = 'bg-slate-800 text-slate-100 rounded-xl py-3 px-5 max-w-[85%] border border-slate-700 prose prose-invert prose-p:my-1 prose-ul:my-1 prose-headings:my-2 text-sm';
    bubble.innerHTML = text ? marked.parse(text) : '<span class="animate-pulse">Escribiendo...</span>';
  }

  msgDiv.appendChild(bubble);
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  return bubble;
}

loadEmbeddedPDF();
