import { GoogleGenAI } from 'https://esm.sh/@google/genai';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let apiKey = localStorage.getItem('gemini_api_key') || '';
let pdfContext = '';
let chatSession = null;

// Elementos del DOM
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

// Cargar API Key previa si existe
if (apiKey) {
  apiKeyInput.value = apiKey;
}

// Cargar automáticamente el PDF estático de la carpeta public
async function loadEmbeddedPDF() {
  try {
    const response = await fetch('contexto.pdf');
    if (!response.ok) throw new Error("No se encontró el archivo 'public/contexto.pdf'");
    
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
    console.error("Error cargando contexto.pdf:", err);
  }
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return alert('Por favor ingresa una API Key válida.');
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

// Inicializar la sesión del Chat
startBtn.addEventListener('click', async () => {
  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
      You are a professional English recruiter from top tech companies (e.g., GOOGLE, NVIDIA, Apple, Microsoft, Amazon, Zapier, GitLab, SumatoSoft, GitHub).
      You are looking for an Automation and AI Semi-Senior developer for a remote job, with SOFT, HARD and ENGLISH skills.
      Use the following JOB DESCRIPTION as context: ${pdfContext}
      
      Your goal is to conduct a mock interview in English.
      - Ask one question at a time.
      - Provide feedback on the user's English level (target: C1-C2).
      - Focus on the technical requirements mentioned in the context.
    `;

    chatSession = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction }
    });

    configSection.classList.add('hidden');
    chatSection.classList.remove('hidden');

    // Saludo e inicio de entrevista
    await sendMessage("Hello, I am ready for the interview.");
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
      messageElement.innerHTML = escapeHTML(fullText);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    const endTime = performance.now();
    
    // Métricas
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
    bubble.className = 'bg-indigo-600 text-white rounded-xl py-2 px-4 max-w-[80%]';
  } else {
    msgDiv.className = 'flex justify-start';
    bubble.className = 'bg-slate-800 text-slate-100 rounded-xl py-2 px-4 max-w-[80%] border border-slate-700';
  }

  bubble.innerHTML = escapeHTML(text);
  msgDiv.appendChild(bubble);
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  return bubble;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Cargar el PDF automáticamente al abrir la página
loadEmbeddedPDF();
